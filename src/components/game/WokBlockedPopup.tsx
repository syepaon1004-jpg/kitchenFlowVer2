import { useUiStore } from '../../stores/uiStore';
import type { WokBlockedReason } from '../../types/game';
import styles from './WokBlockedPopup.module.css';

const REASON_TEXT: Record<WokBlockedReason, { title: string; body: string }> = {
  at_sink: {
    title: '웍이 씻는 중입니다',
    body: '웍이 싱크대로 이동되어 있어 재료를 넣을 수 없습니다. 세척이 끝나면 자동으로 화구로 돌아옵니다.',
  },
  dirty: {
    title: '웍이 더럽습니다',
    body: '웍에 이전 음식이 남아 있어 재료를 넣을 수 없습니다. 웍을 싱크대로 옮겨 씻어 주세요.',
  },
  burned: {
    title: '웍이 탔습니다',
    body: '웍이 타서 사용할 수 없습니다. 싱크대로 옮겨 씻어 주세요.',
  },
};

export default function WokBlockedPopup() {
  const isOpen = useUiStore((s) => s.wokBlockedPopupOpen);
  const reason = useUiStore((s) => s.wokBlockedReason);
  const close = useUiStore((s) => s.closeWokBlockedPopup);

  if (!isOpen || !reason) return null;

  const { title, body } = REASON_TEXT[reason];

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
        </header>
        <p className={styles.body}>{body}</p>
        <button type="button" className={styles.closeButton} onClick={close} autoFocus>
          닫기
        </button>
      </div>
    </div>
  );
}
