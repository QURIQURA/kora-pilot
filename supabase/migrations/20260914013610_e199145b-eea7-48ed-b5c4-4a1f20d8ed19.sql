alter table public.product_components
  add column if not exists formula_version_id uuid references public.formula_versions(id) on delete set null;

alter table public.product_components
  add column if not exists quantity_g numeric;

comment on column public.product_components.formula_version_id is
  'Component는 여러 Formula Version을 가질 수 있음 — 이 Product가 실제로 쓰는 특정 Formula Version. null이면 미지정.';
comment on column public.product_components.quantity_g is
  '이 Product에서 위 Formula Version을 실제 사용하는 양(g). Formula 자체의 기준 배합량과 다를 수 있음 (예: Formula는 1kg 배치, Product는 그 중 150g만 사용). null이면 미지정.';
