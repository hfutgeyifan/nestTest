import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  createKafkaClients,
  type Closable,
  type ConsumerClient,
  type ProducerClient,
} from './kafka-clients';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import {
  STOCK_CHANGED_TOPIC,
  type StockChangedEvent,
} from './stock-changed.event';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private producer: ProducerClient | null = null;
  private consumer: ConsumerClient | null = null;
  private stopped = false;

  constructor(private readonly ledgerService: StockLedgerService) {}

  onModuleInit() {
    void this.connectWithRetry();
  }

  async onModuleDestroy() {
    this.stopped = true;
    await this.disconnectClient(this.consumer);
    await this.disconnectClient(this.producer);
  }

  async emitStockChanged(event: StockChangedEvent) {
    if (!this.producer) {
      this.logger.error(`Kafka 未连接，丢弃事件 ${event.eventId}`);
      return;
    }
    await this.producer.send({
      topic: STOCK_CHANGED_TOPIC,
      messages: [
        {
          key: event.productNo,
          value: JSON.stringify(event),
        },
      ],
    });
  }

  private async disconnectClient(client: Closable | null) {
    if (!client) {
      return;
    }
    await client.disconnect();
  }

  private async connectWithRetry() {
    const brokers = [process.env.KAFKA_BROKER ?? '127.0.0.1:9092'];
    while (!this.stopped) {
      try {
        const clients = createKafkaClients(brokers);
        this.producer = clients.producer;
        this.consumer = clients.consumer;
        await clients.producer.connect();
        await clients.consumer.connect();
        await clients.consumer.subscribe({
          topic: STOCK_CHANGED_TOPIC,
          fromBeginning: true,
        });
        await clients.consumer.run({
          eachMessage: async ({ message }) => {
            if (!message.value) {
              return;
            }
            const event = JSON.parse(
              message.value.toString(),
            ) as StockChangedEvent;
            if (!event?.eventId) {
              this.logger.error('忽略没有 eventId 的消息');
              return;
            }
            await this.ledgerService.record(event);
          },
        });
        this.logger.log(
          `已连接 Kafka ${brokers.join(',')}，消费 ${STOCK_CHANGED_TOPIC}`,
        );
        return;
      } catch (error) {
        this.producer = null;
        this.consumer = null;
        this.logger.error(
          'Kafka 暂不可用，3 秒后重试；确认接口不受影响',
          error instanceof Error ? error.stack : error,
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }
}
