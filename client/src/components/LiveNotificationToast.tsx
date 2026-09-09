import React from 'react';
import { useWebSocket, LiveNotification } from '../context/WebSocketContext';
import {
    CheckCircle2, AlertTriangle, AlertCircle, MessageSquare,
    Shield, X, Bell, ExternalLink
} from 'lucide-react';
import './LiveNotificationToast.css';

export default function LiveNotificationToast() {
    const { notifications, dismissNotification, clearAllNotifications } = useWebSocket();

    if (notifications.length === 0) return null;

    const getIcon = (type: LiveNotification['type']) => {
        switch (type) {
            case 'approved':
                return <CheckCircle2 size={20} className="notif-icon approved" />;
            case 'rejected':
                return <AlertTriangle size={20} className="notif-icon rejected" />;
            case 'approval_submit':
                return <Bell size={20} className="notif-icon submit" />;
            case 'feedback':
            case 'note':
                return <MessageSquare size={20} className="notif-icon note" />;
            default:
                return <Shield size={20} className="notif-icon info" />;
        }
    };

    return (
        <div className="live-toast-container">
            {notifications.map((notif) => (
                <div key={notif.id} className={`live-toast-card type-${notif.type}`}>
                    <div className="toast-left">
                        {getIcon(notif.type)}
                        <div className="toast-content">
                            <h4 className="toast-title">{notif.title}</h4>
                            <p className="toast-message">{notif.message}</p>
                            <span className="toast-time">
                                ⏱️ {new Date(notif.timestamp).toLocaleTimeString('ckb-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                        </div>
                    </div>

                    <button
                        className="btn-toast-dismiss"
                        onClick={() => dismissNotification(notif.id)}
                        title="داخستن"
                    >
                        <X size={16} />
                    </button>
                </div>
            ))}

            {notifications.length > 2 && (
                <button className="btn-clear-all-toasts" onClick={clearAllNotifications}>
                    پاککردنەوەی هەموو ئاگادارییەکان ({notifications.length})
                </button>
            )}
        </div>
    );
}
