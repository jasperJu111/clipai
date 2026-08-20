import { useState, useEffect, useRef } from 'react'
import { playChimeSound } from '../utils/sound'
import { createTimerEndsAt, calculateRemainingSeconds, addTimeToTimer } from '../../shared/timerUtils.js'

export default function HealthTimerModal({
  isOpen,
  onClose,
  timerState,
  setTimerState,
  t = (k) => k
}) {
  const [activeTab, setActiveTab] = useState('presets')
  const [customMinutes, setCustomMinutes] = useState(30)
  const [customTitle, setCustomTitle] = useState('')
  const [customIsLoop, setCustomIsLoop] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [systemNotifEnabled, setSystemNotifEnabled] = useState(true)

  // Stats
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem('clipai_health_stats')
      if (saved) return JSON.parse(saved)
    } catch {}
    return { pomodoroCount: 0, waterCount: 0, moveCount: 0 }
  })

  useEffect(() => {
    try {
      localStorage.setItem('clipai_health_stats', JSON.stringify(stats))
    } catch {}
  }, [stats])

  // Presets definition using locale keys
  const presets = [
    {
      id: 'water',
      emoji: '💧',
      nameKey: 'timer.waterName',
      defaultName: '💧 规律喝水',
      descKey: 'timer.waterDesc',
      defaultDesc: '补充水分，保持专注与身体活力（建议 45 分钟/次）',
      alertKey: 'timer.waterAlert',
      defaultAlert: '💧 该喝水啦！补充一杯温水，给身体充充电～',
      minutes: 45,
      isLoop: true
    },
    {
      id: 'move',
      emoji: '🚶',
      nameKey: 'timer.moveName',
      defaultName: '🚶 久坐活动',
      descKey: 'timer.moveDesc',
      defaultDesc: '站起活动伸展，缓解颈椎与腰部疲劳（建议 50 分钟/次）',
      alertKey: 'timer.moveAlert',
      defaultAlert: '🚶 坐久了，该站起来活动活动筋骨、去窗边走走啦！',
      minutes: 50,
      isLoop: true
    },
    {
      id: 'pomodoro',
      emoji: '🍅',
      nameKey: 'timer.pomodoroName',
      defaultName: '🍅 番茄专注',
      descKey: 'timer.pomodoroDesc',
      defaultDesc: '标准番茄钟：25 分钟沉浸工作 + 5 分钟深度放松',
      alertKey: 'timer.pomodoroAlert',
      defaultAlert: '🍅 番茄钟完成！恭喜完成专注周期，休息 5 分钟吧！',
      minutes: 25,
      isLoop: false
    },
    {
      id: 'meal',
      emoji: '🍱',
      nameKey: 'timer.mealName',
      defaultName: '🍱 按时吃饭',
      descKey: 'timer.mealDesc',
      defaultDesc: '工作再忙也要善待肠胃，按时就餐',
      alertKey: 'timer.mealAlert',
      defaultAlert: '🍱 饭点到了！放下手中的工作，好好享用一顿美食吧～',
      minutes: 90,
      isLoop: true
    },
    {
      id: 'eye',
      emoji: '👀',
      nameKey: 'timer.eyeName',
      defaultName: '👀 远眺护眼',
      descKey: 'timer.eyeDesc',
      defaultDesc: '20-20-20 科学护眼法则，眺望 6 米外远方',
      alertKey: 'timer.eyeAlert',
      defaultAlert: '👀 护眼时间！闭目养神或眺望远方 20 秒，缓解视力疲劳～',
      minutes: 20,
      isLoop: true
    }
  ]

  const startPreset = (p) => {
    const totalSec = p.minutes * 60
    const now = Date.now()
    const newTimer = {
      id: `timer_${now}`,
      cycleId: `cycle_${now}_${Math.random().toString(36).slice(2, 7)}`,
      presetId: p.id,
      title: t(p.nameKey) || p.defaultName,
      alertMessage: t(p.alertKey) || p.defaultAlert,
      totalSeconds: totalSec,
      endsAt: createTimerEndsAt(totalSec, now),
      remainingSeconds: totalSec,
      isRunning: true,
      isLoop: p.isLoop,
      soundEnabled,
      systemNotifEnabled
    }
    setTimerState(newTimer)
  }

  const startCustom = () => {
    const mins = Math.max(1, parseInt(customMinutes, 10) || 1)
    const totalSec = mins * 60
    const title = customTitle.trim() || `${mins} ${t('timer.customMinutes') || '分钟'} 倒计时`
    const now = Date.now()
    const newTimer = {
      id: `custom_${now}`,
      cycleId: `cycle_${now}_${Math.random().toString(36).slice(2, 7)}`,
      presetId: 'custom',
      title,
      alertMessage: `⏰ 时间到啦！【${title}】已完成！`,
      totalSeconds: totalSec,
      endsAt: createTimerEndsAt(totalSec, now),
      remainingSeconds: totalSec,
      isRunning: true,
      isLoop: customIsLoop,
      soundEnabled,
      systemNotifEnabled
    }
    setTimerState(newTimer)
  }

  const togglePause = () => {
    if (!timerState) return
    const now = Date.now()
    setTimerState((prev) => {
      if (!prev) return null
      if (prev.isRunning) {
        const remaining = calculateRemainingSeconds(prev.endsAt, now)
        return {
          ...prev,
          isRunning: false,
          remainingSeconds: remaining,
          endsAt: null
        }
      } else {
        const remaining = Math.max(1, prev.remainingSeconds || prev.totalSeconds)
        return {
          ...prev,
          isRunning: true,
          cycleId: `cycle_${now}_${Math.random().toString(36).slice(2, 7)}`,
          endsAt: createTimerEndsAt(remaining, now),
          remainingSeconds: remaining
        }
      }
    })
  }

  const resetTimer = () => {
    setTimerState(null)
  }

  const snooze5Min = () => {
    if (!timerState) return
    const now = Date.now()
    setTimerState((prev) => addTimeToTimer(prev, 5 * 60, now))
  }

  if (!isOpen) return null

  const progressPercent = timerState && timerState.totalSeconds > 0
    ? Math.max(0, Math.min(100, (timerState.remainingSeconds / timerState.totalSeconds) * 100))
    : 0

  const formatRemaining = (sec) => {
    if (sec <= 0) return '00:00'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="health-timer-overlay" onClick={onClose}>
      <div className="health-timer-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="health-timer-header">
          <div className="health-timer-title-group">
            <span className="health-timer-title-icon">⏱️</span>
            <div>
              <div className="health-timer-title">{t('timer.title') || '健康作息与专注定时器'}</div>
              <div className="health-timer-subtitle">{t('timer.subtitle') || '科学劳逸结合，定时提醒喝水、久坐活动与就餐休息'}</div>
            </div>
          </div>
          <button className="health-timer-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Active Timer Card (If Running/Paused) */}
        {timerState && (
          <div className={`health-timer-active-card ${timerState.isRunning ? 'running' : 'paused'}`}>
            <div className="active-timer-top">
              <div className="active-timer-info">
                <span className="active-timer-badge">
                  {timerState.isRunning ? `⚡ ${t('timer.runningBadge') || '运行中'}` : `⏸️ ${t('timer.pausedBadge') || '已暂停'}`}
                </span>
                <span className="active-timer-name">{timerState.title}</span>
              </div>
              <span className="active-timer-loop-tag">
                {timerState.isLoop ? `🔄 ${t('timer.loopLabel') || '自动循环'}` : '⏳ 单次'}
              </span>
            </div>

            <div className="active-timer-clock-box">
              <div className="active-timer-digits">
                {formatRemaining(timerState.remainingSeconds)}
              </div>
              <div className="active-timer-progress-bg">
                <div
                  className="active-timer-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="active-timer-btn-row">
              <button
                className={`btn ${timerState.isRunning ? 'btn-secondary' : 'btn-primary'} timer-ctrl-btn`}
                onClick={togglePause}
              >
                {timerState.isRunning ? `⏸️ ${t('timer.pauseTimer') || '暂停'}` : `▶️ ${t('timer.resumeTimer') || '继续'}`}
              </button>
              <button
                className="btn btn-secondary timer-ctrl-btn"
                onClick={snooze5Min}
                title="加 5 分钟"
              >
                +5m
              </button>
              <button
                className="btn btn-danger timer-ctrl-btn"
                onClick={resetTimer}
              >
                {t('timer.resetTimer') || '取消'}
              </button>
            </div>
          </div>
        )}

        {/* Tab Switch */}
        <div className="health-timer-tabs">
          <button
            className={`health-timer-tab-btn ${activeTab === 'presets' ? 'active' : ''}`}
            onClick={() => setActiveTab('presets')}
          >
            {t('timer.tabQuick') || '🌟 预设健康场景'}
          </button>
          <button
            className={`health-timer-tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
            onClick={() => setActiveTab('custom')}
          >
            {t('timer.tabCustom') || '✏️ 自定义倒计时'}
          </button>
        </div>

        {/* Body Content */}
        <div className="health-timer-body">
          {activeTab === 'presets' ? (
            <div className="health-timer-presets-list">
              {presets.map((p) => {
                const isThisActive = timerState?.presetId === p.id
                return (
                  <div
                    key={p.id}
                    className={`health-preset-item ${isThisActive ? 'selected' : ''}`}
                    onClick={() => startPreset(p)}
                  >
                    <div className="health-preset-icon">{p.emoji}</div>
                    <div className="health-preset-info">
                      <div className="health-preset-header">
                        <span className="health-preset-name">{t(p.nameKey) || p.defaultName}</span>
                        <span className="health-preset-duration">{p.minutes} {t('timer.customMinutes') || '分钟'}</span>
                      </div>
                      <div className="health-preset-desc">{t(p.descKey) || p.defaultDesc}</div>
                    </div>
                    <button className="btn btn-primary btn-sm health-preset-start-btn">
                      {isThisActive ? '🔄 重新开始' : '▶️ 启动'}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="health-timer-custom-pane">
              {/* Quick Pills */}
              <div className="custom-timer-field">
                <label className="custom-field-label">{t('timer.quickPreset') || '快捷时长：'}</label>
                <div className="custom-quick-pills">
                  {[10, 15, 20, 25, 30, 45, 60, 90, 120].map((m) => (
                    <button
                      key={m}
                      className={`custom-pill ${customMinutes === m ? 'active' : ''}`}
                      onClick={() => setCustomMinutes(m)}
                    >
                      {m} {t('timer.customMinutes') || 'm'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Free Input Slider & Number */}
              <div className="custom-timer-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="custom-field-label">设置时长 ({t('timer.customMinutes') || '分钟'})</label>
                  <input
                    type="number"
                    min="1"
                    max="480"
                    className="settings-input custom-min-input"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                </div>
                <input
                  type="range"
                  min="1"
                  max="180"
                  step="1"
                  className="custom-range-slider"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(parseInt(e.target.value, 10))}
                />
              </div>

              {/* Custom Title Input */}
              <div className="custom-timer-field">
                <label className="custom-field-label">{t('timer.customTitleLabel') || '提醒标题与文案'}</label>
                <input
                  type="text"
                  className="settings-input"
                  placeholder={t('timer.customTitlePlaceholder') || '例如：下楼拿快递、准备下午部门例会...'}
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                />
              </div>

              {/* Loop Switch */}
              <div className="custom-switch-row" onClick={() => setCustomIsLoop(!customIsLoop)}>
                <input
                  type="checkbox"
                  checked={customIsLoop}
                  onChange={(e) => setCustomIsLoop(e.target.checked)}
                />
                <span className="custom-switch-label">{t('timer.loopLabel') || '🔄 周期循环提醒（结束后自动开启下一轮）'}</span>
              </div>

              <button className="btn btn-primary custom-start-btn" onClick={startCustom}>
                🚀 {t('timer.startTimer') || '开始计时'} ({customMinutes} {t('timer.customMinutes') || '分钟'})
              </button>
            </div>
          )}
        </div>

        {/* Footer Settings & Stats */}
        <div className="health-timer-footer">
          <div className="health-footer-toggles">
            <label className="health-toggle-label" title="播放提示音">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
              />
              <span>{t('timer.soundLabel') || '🔔 提示音'}</span>
            </label>
            <label className="health-toggle-label" title="系统级通知弹窗">
              <input
                type="checkbox"
                checked={systemNotifEnabled}
                onChange={(e) => setSystemNotifEnabled(e.target.checked)}
              />
              <span>{t('timer.systemNotifLabel') || '🖥️ 桌面弹窗'}</span>
            </label>
          </div>

          <div className="health-stats-summary">
            <span title="今日番茄">🍅 {stats.pomodoroCount || 0}</span>
            <span title="今日喝水">💧 {stats.waterCount || 0}</span>
            <span title="今日活动">🚶 {stats.moveCount || 0}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
