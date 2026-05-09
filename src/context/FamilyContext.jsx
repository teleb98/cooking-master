import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

const FamilyContext = createContext(null);

const STORAGE_KEY = 'cookingMaster_profile';
const TOKEN_KEY   = 'cookingMaster_token';

const DEFAULTS = {
  family_type:     'couple',
  baby_birthday:   null,
  baby_name:       null,
  shopping_day:    6,
  partner_name:    null,
  food_likes:      [],
  allergies:       [],
  family_group_id: null,
};

const DAYS_KR = ['월', '화', '수', '목', '금', '토', '일'];

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

function monthsOld(birthday) {
  if (!birthday) return 0;
  return Math.floor((Date.now() - new Date(birthday)) / (1000 * 60 * 60 * 24 * 30.44));
}

function babyStage(months) {
  if (months <  6) return { stage: '초기', en: 'early-stage' };
  if (months <  9) return { stage: '중기', en: 'mid-stage'   };
  if (months < 12) return { stage: '후기', en: 'late-stage'  };
  return               { stage: '완료기', en: 'complete'     };
}

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function FamilyProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState(loadLocal);
  const [members, setMembers] = useState([]);

  const loadProfile = useCallback(async () => {
    try {
      const { profile: srv, members: srvMembers } = await apiFetch('/user/profile');
      if (srv && Object.keys(srv).length > 1) {
        const merged = { ...DEFAULTS, ...srv };
        setProfile(merged);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        localStorage.setItem('cookingMaster_onboarded', '1');
      }
      setMembers(srvMembers ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadProfile();
  }, [isAuthenticated, loadProfile]);

  const saveProfile = useCallback(async (updates) => {
    const next = { ...profile, ...updates };
    setProfile(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    try {
      const { profile: saved, members: srvMembers } = await apiFetch('/user/profile', {
        method: 'PUT',
        body: JSON.stringify(next),
      });
      if (saved) {
        const merged = { ...DEFAULTS, ...saved };
        setProfile(merged);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
      setMembers(srvMembers ?? []);
    } catch {}
    return next;
  }, [profile]);

  const months = monthsOld(profile.baby_birthday);
  const { stage, en: stage_en } = babyStage(months);

  // 연결된 파트너 멤버 (active 상태의 partner role)
  const activePartner = members.find(m => m.role === 'partner' && m.status === 'active');

  const family = {
    name:              user?.name ?? '우리 가족',
    initial:           (user?.name ?? '가')[0],
    type:              profile.family_type,
    has_baby:          !!profile.baby_birthday,
    baby_name:         profile.baby_name ?? null,
    baby_months:       months,
    baby_stage:        stage,
    baby_stage_en:     stage_en,
    shopping_day:      profile.shopping_day,
    shopping_day_kr:   DAYS_KR[profile.shopping_day] ?? '일',
    partner_name:      activePartner?.name ?? profile.partner_name,
    partner_connected: !!activePartner,
    family_group_id:   profile.family_group_id ?? null,
    food_likes:        Array.isArray(profile.food_likes) ? profile.food_likes : [],
    allergies:         Array.isArray(profile.allergies)  ? profile.allergies  : [],
  };

  return (
    <FamilyContext.Provider value={{ profile, family, members, saveProfile, loadProfile }}>
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  return useContext(FamilyContext);
}
