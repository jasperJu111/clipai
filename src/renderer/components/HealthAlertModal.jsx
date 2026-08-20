import React from 'react'

export default function HealthAlertModal({
  alertData,
  onAcknowledge,
  onSnooze,
  onRestartLoop,
  t = (k) => k
}) {
  if (!alertData) return null

  return (
    <div className="health-alert-overlay">
      <div className="health-alert-modal">
        <div className="health-alert-emoji-ring">
          <span className="health-alert-emoji">{alertData.emoji || '⏰'}</span>
        </div>

        <div className="health-alert-title">{alertData.title}</div>
        <div className="health-alert-message">{alertData.message}</div>

        <div className="health-alert-btn-group">
          {alertData.isLoop ? (
            <button className="btn btn-primary alert-action-btn" onClick={onRestartLoop}>
              🔄 {t('timer.startTimer') || '开启下一轮'}
            </button>
          ) : (
            <button className="btn btn-primary alert-action-btn" onClick={onAcknowledge}>
              {t('timer.acknowledge') || '✅ 我知道了'}
            </button>
          )}

          <button className="btn btn-secondary alert-action-btn" onClick={onSnooze}>
            {t('timer.snooze5Min') || '⏰ 稍后 5 分钟再提醒'}
          </button>
        </div>
      </div>
    </div>
  )
}
