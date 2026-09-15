-- Add GDPR privacy settings to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_email boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_location boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_history boolean DEFAULT false;
