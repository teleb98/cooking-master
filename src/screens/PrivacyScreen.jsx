export default function PrivacyScreen() {
  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)',
      padding: '60px 24px 40px', maxWidth: 680, margin: '0 auto',
      fontFamily: 'inherit', color: 'var(--ink)', lineHeight: 1.75,
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>개인정보처리방침</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 32 }}>최종 업데이트: 2025년 5월</p>

      <Section title="1. 수집하는 정보">
        Cooking Master는 소셜 로그인(Google, Kakao, Naver, Facebook) 시 서비스 제공자로부터
        아래 정보를 수집합니다.
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>이름 또는 닉네임</li>
          <li>이메일 주소 (제공된 경우)</li>
          <li>프로필 사진 URL</li>
        </ul>
      </Section>

      <Section title="2. 정보 이용 목적">
        수집된 정보는 다음 목적으로만 사용됩니다.
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>회원 식별 및 로그인 처리</li>
          <li>식단 계획, 장보기 목록 등 앱 기능 제공</li>
          <li>서비스 개선 및 오류 분석</li>
        </ul>
      </Section>

      <Section title="3. 정보 보관 및 보호">
        사용자 데이터는 Supabase(PostgreSQL) 클라우드 데이터베이스에 암호화하여 저장합니다.
        제3자에게 판매하거나 마케팅 목적으로 공유하지 않습니다.
      </Section>

      <Section title="4. 데이터 삭제 요청">
        언제든지 데이터 삭제를 요청할 수 있습니다.{' '}
        <a href="/data-deletion" style={{ color: 'var(--accent)' }}>데이터 삭제 페이지</a>를
        방문하거나 아래 이메일로 문의해 주세요.
        <br />
        <strong>chiwon@gmail.com</strong>
      </Section>

      <Section title="5. 문의">
        개인정보 관련 문의: <strong>chiwon@gmail.com</strong>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0 }}>{children}</p>
    </div>
  );
}
