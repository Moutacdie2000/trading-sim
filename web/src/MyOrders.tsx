import type { MyOrder } from './types.js';

interface Props {
  orders:   MyOrder[];
  onCancel: (orderId: number) => void;
}

const STATUS_LABEL: Record<MyOrder['status'], string> = {
  pending:   'sending…',
  accepted:  'live',
  filled:    'filled',
  cancelled: 'cancelled',
  rejected:  'rejected',
};

export function MyOrders({ orders, onCancel }: Props) {
  if (orders.length === 0) {
    return <p className="muted">No orders yet. Submit one with the form on the left.</p>;
  }
  return (
    <table className="my-orders">
      <thead>
        <tr>
          <th>Side</th><th>Type</th><th>Price</th><th>Filled</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          const cancellable = o.status === 'accepted' && o.orderId !== null;
          return (
            <tr key={o.clientId} className={`status-${o.status}`}>
              <td className={o.side}>{o.side.toUpperCase()}</td>
              <td>{o.type}</td>
              <td>{o.type === 'market' ? '—' : o.price.toFixed(2)}</td>
              <td>{o.filledQty}/{o.qty}</td>
              <td><span className={`pill status-${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
              <td>
                {cancellable && (
                  <button className="link" onClick={() => onCancel(o.orderId!)}>cancel</button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
