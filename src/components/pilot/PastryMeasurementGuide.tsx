import { SectionCard } from "./ui";

/** Read-only starting references; never writes product targets, orders or sessions. */
export function PastryMeasurementGuide() {
  return (
    <SectionCard title="PASTRY R&D · 측정과 크림 참고량">
      <div className="space-y-3 text-sm">
        <p>
          몰드 내부 치수 → 완성 규격 → Formula 버전 → 제조 산출량 → 제품 사용량 → 남은 재고 순서로
          기록하세요. 모든 항목을 첫날부터 잴 필요는 없어요. 오늘은 크림 하나의 산출량과 잔량부터
          시작해도 됩니다.
        </p>
        <details>
          <summary className="cursor-pointer font-medium">원형 케이크 크림 초기 목표 보기</summary>
          <p className="my-2 text-xs text-muted-foreground">
            생크림·샹티 계열 / 시트 3장·샌딩 2층 / 완성 높이 약 8–10cm / 기본 아이싱. 과일·큰
            파이핑·작업 여유분 제외. 설탕 등을 포함한 완성 크림 g이며 실측 표준이 아닌 초기
            목표입니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th>사이즈</th>
                  <th>샌딩 1층</th>
                  <th>샌딩 합계</th>
                  <th>아이싱</th>
                  <th>합계</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>6인치</td>
                  <td>225g</td>
                  <td>450g</td>
                  <td>250g</td>
                  <td>700g</td>
                </tr>
                <tr>
                  <td>8인치</td>
                  <td>400g</td>
                  <td>800g</td>
                  <td>350g</td>
                  <td>1,150g</td>
                </tr>
                <tr>
                  <td>10인치</td>
                  <td>625g</td>
                  <td>1,250g</td>
                  <td>500g</td>
                  <td>1,750g</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            8인치 샌딩 800g은 사용자 지정 목표입니다. 다른 크기는 면적 비율로 조정한 추정치이며
            버터크림·비휘핑 가나슈·무스크림에 공통 적용하지 않습니다. 실제 사용량을 반복 확인한 뒤
            제품별 기준으로 채택하세요.
          </p>
        </details>
        <details>
          <summary className="cursor-pointer font-medium">작업 중 무엇을 재면 되나요?</summary>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            <li>빈 용기를 제외하고, 제조가 끝난 사용 가능 크림 g을 잽니다.</li>
            <li>제품에 쓴 양 또는 작업 후 보관한 잔량을 기록합니다.</li>
            <li>폐기와 다시 보관한 재고를 구분하고 같은 손실을 두 번 계산하지 않습니다.</li>
            <li>
              못 잰 값은 미측정으로 남깁니다. 볼에서 줄어든 g에는 도구 잔량·폐기가 포함될 수 있어요.
            </li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            현재는 생산 세션 NOTES에 Formula 버전·산출량·사용/배정량·잔량·폐기를 남기세요. Base
            Weight는 제조 목표 g 프리셋이며 실제 산출량이나 제품 사용량과는 다릅니다.
          </p>
        </details>
      </div>
    </SectionCard>
  );
}
