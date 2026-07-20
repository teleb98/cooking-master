// 판매자(사업자) 정보 — 전자상거래법상 통신판매업자가 표시해야 하는 항목.
// 법인 사업자등록·통신판매업신고 완료 후 .env 에 실제 값을 채운다. 미설정 시
// '(등록 예정)' 로 노출되며, seller_info.ready=false 로 프론트가 안내 문구를 띄운다.

function v(name, fallback) {
  const val = (process.env[name] ?? '').trim();
  return val || fallback;
}

export function getSellerInfo() {
  const bizNo = v('SELLER_BIZ_NO', '');
  const moNo  = v('SELLER_MO_NO', '');
  return {
    company:   v('SELLER_COMPANY', 'rarebook'),          // 상호
    ceo:       v('SELLER_CEO', '(등록 예정)'),            // 대표자
    bizNo,                                                // 사업자등록번호
    moNo,                                                 // 통신판매업신고번호
    address:   v('SELLER_ADDRESS', '(등록 예정)'),        // 사업장 주소
    tel:       v('SELLER_TEL', '(등록 예정)'),            // 연락처
    email:     v('SELLER_EMAIL', 'hello@rarebook.co.kr'), // 고객문의 이메일
    hosting:   v('SELLER_HOSTING', 'rarebook'),           // 호스팅 제공자
    // 사업자등록번호 + 통신판매업신고번호가 모두 있어야 실제 판매 가능 상태로 간주
    ready:     Boolean(bizNo && moNo),
  };
}

// 구독(정기결제) 상품 고지 — 결제 전 명확히 보여줘야 하는 항목
export const SUBSCRIPTION_TERMS = {
  productName: 'Cooking Master Premium',
  priceKRW: Number(process.env.PLAN_PRICE_KRW ?? 2900),
  period: '월 1회 (30일)',
  autoRenew: true,
  refundPolicy:
    '결제 후 서비스(AI 생성·채팅)를 사용하지 않은 경우 결제일로부터 7일 이내 전액 환불이 가능합니다. ' +
    '이미 사용을 개시한 경우 해당 결제분은 환불되지 않으며, 해지 시 다음 갱신일부터 청구되지 않습니다. ' +
    '자세한 문의는 고객센터 이메일로 연락 주세요.',
};
