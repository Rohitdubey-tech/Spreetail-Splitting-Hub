import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export const SettleModal = ({
  isOpen,
  onClose,
  groupId,
  groupMembers,
  onSuccess,
  initialPayerId = '',
  initialReceiverId = '',
  initialAmount = 0
}) => {
  const { apiBaseUrl, user } = useAuth();
  const [payerId, setPayerId] = useState(initialPayerId);
  const [receiverId, setReceiverId] = useState(initialReceiverId);
  const [amount, setAmount] = useState(initialAmount || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setPayerId(initialPayerId || user?.id || '');
      setReceiverId(initialReceiverId || (groupMembers.find(m => m.id !== (initialPayerId || user?.id))?.id || ''));
      setAmount(initialAmount || '');
    }
  }, [isOpen, initialPayerId, initialReceiverId, initialAmount, groupMembers, user]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const amt = parseFloat(String(amount));
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    if (!payerId || !receiverId) {
      setError('Please select both a sender and a receiver');
      return;
    }

    if (payerId === receiverId) {
      setError('Sender and receiver cannot be the same user');
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${apiBaseUrl}/settlements`, {
        groupId,
        payerId,
        receiverId,
        amount: amt
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record settlement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container glass" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Record Payment</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="settle-payer">Who Paid?</label>
              <select
                id="settle-payer"
                className="form-select"
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                required
              >
                {groupMembers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.id === user?.id ? 'You' : m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="settle-receiver">Who Was Paid?</label>
              <select
                id="settle-receiver"
                className="form-select"
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                required
              >
                {groupMembers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.id === user?.id ? 'You' : m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="settle-amt">Amount ($)</label>
              <input
                id="settle-amt"
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettleModal;
