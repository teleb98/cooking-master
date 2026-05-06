import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

const FamilyContext = createContext(null);

const STORAGE_KEY = 'cookingMaster_profile';
const TOKEN_KEY   = 'cookingMaster_token';

const DEFAULTS = {
  family_type:   'couple',
  baby_birthday: null,
  baby_name:     null,
  shopping_day:  6,
  partner_name:  null,
  food_likes:    [],
  allergies:     [],
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

  // Pull saved profile from server on login
  useEffect(() => {
    if (!isAuthenticated) return;
    apiFetch('/user/profile')
      .then(({ profile: srv }) => {
        if (srv && Object.keys(srv).length > 1) {
          const merged = { ...DEFAULTS, ...srv };
          setProfile(merged);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          // Restore onboarded flag for returning users who logged out
          localStorage.setItem('cookingMaster_onboarded', '1');
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const saveProfile = useCallback(async (updates) => {
    const next = { ...profile, ...updates };
    setProfile(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    await apiFetch('/user/profile', { method: 'PUT', body: JSON.stringify(next) }).catch(() => {});
    return next;
  }, [profile]);

  const months = monthsOld(profile.baby_birthday);
  const { stage, en: stage_en } = babyStage(months);

  // Derived display object used across screens
  const family = {
    // Identity
    name:           user?.name ?? '우리 가족',
    initial:        (user?.name ?? '가')[0],
    type:           profile.family_type,
    // Baby
    has_baby:       !!profile.baby_birthday,
    baby_name:      profile.baby_name ?? null,
    baby_months:    months,
    baby_stage:     stage,
    baby_stage_en:  stage_en,
    // Shopping
    shopping_day:    profile.shopping_day,
    shopping_day_kr: DAYS_KR[profile.shopping_day] ?? '일',
    // Partner
    partner_name:    profile.partner_name,
    // Preferences
    food_likes:      Array.isArray(profile.food_likes) ? profile.food_likes : [],
    allergies:       Array.isArray(profile.allergies)  ? profile.allergies  : [],
  };

  return (
    <FamilyContext.Provider value={{ profile, family, saveProfile }}>
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  return useContext(FamilyContext);
}
