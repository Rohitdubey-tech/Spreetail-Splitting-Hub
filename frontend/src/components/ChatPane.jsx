import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

export const ChatPane = ({ expenseId, expenseTitle, onClose }) => {
  const { user, apiBaseUrl } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`${apiBaseUrl}/expenses/${expenseId}/messages`);
        setMessages(res.data);
      } catch (err) {
        console.error('Failed to load chat history', err);
      }
    };
    fetchHistory();
  }, [expenseId, apiBaseUrl]);

  useEffect(() => {
    const socket = io('http://localhost:3001');
    socketRef.current = socket;

    socket.emit('join_expense', { expenseId });

    socket.on('receive_message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.emit('leave_expense', { expenseId });
      socket.disconnect();
    };
  }, [expenseId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim() || !user || !socketRef.current) return;

    socketRef.current.emit('send_message', {
      expenseId,
      userId: user.id,
      message: text.trim()
    });

    setText('');
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-panel glass">
      <div className="chat-header">
        <div>
          <h3 className="chat-title">Expense Chat</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{expenseTitle}</p>
        </div>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', margin: 'auto' }}>
            No messages yet. Ask a question or start a discussion!
          </p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.userId === user?.id;
            return (
              <div key={msg.id} className={`message-bubble ${isMine ? 'mine' : ''}`}>
                <img
                  className="avatar-sm"
                  src={msg.user.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.user.name}`}
                  alt={msg.user.name}
                  style={{ marginTop: '4px' }}
                />
                <div className="message-bubble-content">
                  <div className="message-meta">
                    <span className="message-sender">{isMine ? 'You' : msg.user.name}</span>
                    <span>{formatTime(msg.createdAt)}</span>
                  </div>
                  <div className="message-text-wrapper">
                    {msg.message}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <form onSubmit={handleSend} className="chat-form">
          <input
            type="text"
            className="form-input"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ borderRadius: '24px', padding: '10px 18px' }}
            required
          />
          <button
            type="submit"
            className="btn btn-primary"
            style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, justifyContent: 'center', flexShrink: 0 }}
          >
            ✈
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPane;
