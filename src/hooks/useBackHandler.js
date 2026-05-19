import { useEffect, useRef } from 'react';

/**
 * 2-depth 오버레이(Sheet, MealPicker 등)에서 안드로이드 back 버튼 처리.
 *
 * open=true 시 dummy history 항목을 push해 back 버튼을 가로챕니다.
 * - back 버튼 → onClose() 호출 후 history 항목은 이미 pop됨
 * - X버튼/배경/액션 close → cleanup에서 history.back()으로 항목 정리
 */
export function useBackHandler(open, onClose) {
  // 항상 최신 onClose를 참조 (stale closure 방지)
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;

    history.pushState({ _sheet: true }, '');
    let closedByBack = false;

    const handler = () => {
      closedByBack = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handler);

    return () => {
      window.removeEventListener('popstate', handler);
      // X버튼이나 액션으로 닫힌 경우, 우리가 push한 history 항목 정리
      if (!closedByBack) {
        history.back();
      }
    };
  }, [open]);
}
