-- Push notification subscription (Web Push API PushSubscription JSON)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS push_subscription JSONB;
