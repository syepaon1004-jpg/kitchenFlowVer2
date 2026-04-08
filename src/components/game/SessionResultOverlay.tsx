import type { GameScoreEvent } from '../../types/db';
import styles from './SessionResultOverlay.module.css';

export type FeedbackState = 'idle' | 'loading' | 'failed' | { text: string };

interface SessionResultOverlayProps {
  score: number;
  scoreEvents: GameScoreEvent[];
  feedbackState: FeedbackState;
  onRequestFeedback: () => void;
  onFeed: () => void;
  onClose: () => void;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  fast_serve: '빠른 서빙',
  slow_serve: '느린 서빙',
  very_slow_serve: '매우 느린 서빙',
  dispose: '재료 폐기',
  wok_burned: '웍 태움',
  short_idle: '5초 이상 공백',
  long_idle: '10초 이상 공백',
  redundant_nav: '불필요한 반복 이동',
};

export default function SessionResultOverlay({
  score,
  scoreEvents,
  feedbackState,
  onRequestFeedback,
  onFeed,
  onClose,
}: SessionResultOverlayProps) {
  // 점수 이벤트를 유형별로 집계
  const eventSummary = new Map<string, { count: number; totalPoints: number; perPoint: number }>();
  for (const e of scoreEvents) {
    const existing = eventSummary.get(e.event_type);
    if (existing) {
      existing.count++;
      existing.totalPoints += e.points;
    } else {
      eventSummary.set(e.event_type, {
        count: 1,
        totalPoints: e.points,
        perPoint: e.points,
      });
    }
  }

  const renderFeedback = () => {
    if (typeof feedbackState === 'object') {
      return <div className={styles.feedbackText}>{feedbackState.text}</div>;
    }
    if (feedbackState === 'failed') {
      return <div className={styles.feedbackLoading}>피드백을 생성하지 못했습니다</div>;
    }
    if (feedbackState === 'loading') {
      return (
        <div className={styles.feedbackLoadingMsg}>
          AI 코치가 분석 중입니다<span className={styles.dots} />
        </div>
      );
    }
    // idle
    return (
      <button type="button" className={styles.requestFeedbackBtn} onClick={onRequestFeedback}>
        AI 피드백 받아보기
      </button>
    );
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <div className={styles.title}>게임 종료</div>

        <div className={styles.scoreSection}>
          <div className={styles.scoreLabel}>총점</div>
          <div className={styles.scoreValue}>{score}점</div>
        </div>

        <div className={styles.sectionTitle}>점수 내역</div>
        <ul className={styles.eventList}>
          {Array.from(eventSummary.entries()).map(([type, { count, totalPoints, perPoint }]) => {
            const label = EVENT_TYPE_LABELS[type] ?? type;
            const isPositive = perPoint > 0;
            return (
              <li key={type} className={styles.eventItem}>
                <span>
                  <span className={styles.eventLabel}>{label}</span>
                  <span className={styles.eventCount}> x{count}</span>
                </span>
                <span
                  className={`${styles.eventPoints} ${isPositive ? styles.eventPositive : styles.eventNegative}`}
                >
                  {isPositive ? '+' : ''}{totalPoints}점
                </span>
              </li>
            );
          })}
          {eventSummary.size === 0 && (
            <li className={styles.eventItem}>
              <span className={styles.eventLabel}>이벤트 없음</span>
            </li>
          )}
        </ul>

        <div className={styles.feedbackSection}>
          <div className={styles.sectionTitle}>AI 코치 피드백</div>
          {renderFeedback()}
        </div>

        <div className={styles.actions}>
          <button className={styles.feedBtn} onClick={onFeed}>
            내 피드 보기
          </button>
          <button className={styles.closeBtn} onClick={onClose}>
            게임 종료
          </button>
        </div>
      </div>
    </div>
  );
}
