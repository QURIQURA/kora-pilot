-- STEP10 — 실시간 음성 작업 로그: process_events에 음성 출처 필드 추가
-- source: 이벤트가 수동 입력(manual)인지 음성 로그(voice)인지 구분
-- transcript: 음성 인식 원문 (source='voice'일 때만 값이 있음, 원문 보존용)
-- confidence: AI 이벤트 분류 확신도 (0~1, source='voice'일 때만)
ALTER TABLE public.process_events
  ADD COLUMN source text NOT NULL DEFAULT 'manual',
  ADD COLUMN transcript text,
  ADD COLUMN confidence real;

ALTER TABLE public.process_events
  ADD CONSTRAINT process_events_source_check
    CHECK (source IN ('manual', 'voice'));

ALTER TABLE public.process_events
  ADD CONSTRAINT process_events_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

COMMENT ON COLUMN public.process_events.source IS
  'manual: QUICK LOG/수동 입력, voice: 음성 인식 로그. 타임스탬프는 두 경우 모두 서버에서 생성.';
COMMENT ON COLUMN public.process_events.transcript IS
  '음성 입력 원문(STT 결과). 재분류/디버깅/향후 학습 데이터용으로 보존.';
COMMENT ON COLUMN public.process_events.confidence IS
  'AI가 발화를 이벤트로 분류한 확신도. 낮으면 UI에서 확인을 유도.';
