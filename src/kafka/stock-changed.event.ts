export const STOCK_CHANGED_TOPIC = 'stock.changed';

export type StockChangeType = 'inbound' | 'outbound';

export type StockChangedEvent = {
  eventId: string;
  type: StockChangeType;
  userId: number;
  username: string;
  productNo: string;
  productName: string;
  quantity: number;
  shelfName: string;
  documentId: number;
  orderNo: string;
  occurredAt: string;
};
