/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Kafka } from 'kafkajs';

export type Closable = {
  disconnect: () => Promise<void>;
};

export type ProducerClient = Closable & {
  connect: () => Promise<void>;
  send: (payload: {
    topic: string;
    messages: Array<{ key: string; value: string }>;
  }) => Promise<unknown>;
};

export type ConsumerClient = Closable & {
  connect: () => Promise<void>;
  subscribe: (opts: {
    topic: string;
    fromBeginning?: boolean;
  }) => Promise<void>;
  run: (opts: {
    eachMessage: (payload: {
      message: { value: Buffer | null };
    }) => Promise<void>;
  }) => Promise<void>;
};

export function createKafkaClients(brokers: string[]): {
  producer: ProducerClient;
  consumer: ConsumerClient;
} {
  const kafka = new Kafka({
    clientId: 'storage-app',
    brokers,
    retry: { retries: 5 },
  });
  return {
    producer: kafka.producer(),
    consumer: kafka.consumer({ groupId: 'storage-ledger' }),
  };
}
