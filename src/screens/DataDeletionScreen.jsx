export default function DataDeletionScreen() {
  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)',
      padding: '60px 24px 40px', maxWidth: 680, margin: '0 auto',
      fontFamily: 'inherit', color: 'var(--ink)', lineHeight: 1.75,
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>데이터 삭제 요청</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 32 }}>Cooking Master 사용자 데이터 삭제 안내</p>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 16, padding: '24px 24px', marginBottom: 28,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>삭제 요청 방법</h2>
        <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 16px' }}>
          아래 이메일로 삭제 요청을 보내주시면 <strong>7일 이내</strong>에 처리해 드립니다.
        </p>
        <a
          href="mailto:chiwon@gmail.com?subject=데이터 삭제 요청&body=안녕하세요. Cooking Master 계정 데이터 삭제를 요청합니다.%0A%0A로그인에 사용한 소셜 계정: "
          style={{
            display: 'inline-block',
            background: 'var(--accent)', color: '#fff',
            padding: '12px 24px', borderRadius: 12,
            fontSize: 14, fontWeight: 700, textDecoration: 'none',
          }}
        >
          삭제 요청 이메일 보내기
        </a>
      </div>

      <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>삭제되는 데이터</h2>
        <ul style={{ paddingLeft: 20, margin: '0 0 20px' }}>
          <li>이름, 이메일, 프로필 사진</li>
          <li>식단 계획 및 장보기 목록</li>
          <li>가족 그룹 정보</li>
          <li>모든 앱 사용 데이터</li>
        </ul>
        <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>
          삭제 후에는 복구가 불가능합니다. 문의: <strong>chiwon@gmail.com</strong>
        </p>
      </div>
    </div>
  );
}
