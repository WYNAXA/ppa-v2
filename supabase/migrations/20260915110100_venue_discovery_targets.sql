-- Where we have searched, and where we haven't.
--
-- The directory came from Google Places -- 5,815 of 6,099 venues carry
-- external_ref = 'google_places:ChIJ...'. Towns with no venues are empty
-- because nobody searched there, not because padel doesn't exist. This table
-- is the answer to "which towns have we covered".

CREATE TABLE IF NOT EXISTS public.venue_discovery_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  country_code  text NOT NULL DEFAULT 'GB',
  latitude      double precision NOT NULL,
  longitude     double precision NOT NULL,
  radius_m      integer NOT NULL DEFAULT 20000,
  last_searched_at timestamptz,
  last_found_count integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS venue_discovery_targets_country_name_uniq
  ON public.venue_discovery_targets (country_code, lower(name));

ALTER TABLE public.venue_discovery_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage discovery targets"
  ON public.venue_discovery_targets
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- UK towns/cities over ~50k population not already well covered by existing
-- active clubs. Coordinates from ONS / Nominatim.
INSERT INTO public.venue_discovery_targets (name, country_code, latitude, longitude, radius_m) VALUES
  ('Bath',           'GB', 51.3811, -2.3590, 15000),
  ('Cardiff',        'GB', 51.4816, -3.1791, 20000),
  ('Newport',        'GB', 51.5842, -2.9977, 15000),
  ('Swindon',        'GB', 51.5558, -1.7797, 15000),
  ('Cheltenham',     'GB', 51.8994, -2.0783, 15000),
  ('Gloucester',     'GB', 51.8642, -2.2382, 15000),
  ('Exeter',         'GB', 50.7184, -3.5339, 20000),
  ('Plymouth',       'GB', 50.3755, -4.1427, 20000),
  ('Southampton',    'GB', 50.9097, -1.4044, 20000),
  ('Portsmouth',     'GB', 50.8198, -1.0880, 15000),
  ('Brighton',       'GB', 50.8225, -0.1372, 20000),
  ('Reading',        'GB', 51.4543, -0.9781, 15000),
  ('Oxford',         'GB', 51.7520, -1.2577, 15000),
  ('Cambridge',      'GB', 52.2053, 0.1218,  15000),
  ('Norwich',        'GB', 52.6309, 1.2974,  20000),
  ('Nottingham',     'GB', 52.9548, -1.1581, 20000),
  ('Sheffield',      'GB', 53.3811, -1.4701, 20000),
  ('Derby',          'GB', 52.9225, -1.4746, 15000),
  ('Leicester',      'GB', 52.6369, -1.1398, 20000),
  ('Coventry',       'GB', 52.4068, -1.5197, 15000),
  ('Stoke-on-Trent', 'GB', 53.0027, -2.1794, 15000),
  ('Preston',        'GB', 53.7632, -2.7031, 15000),
  ('Blackpool',      'GB', 53.8142, -3.0503, 15000),
  ('Bolton',         'GB', 53.5785, -2.4299, 15000),
  ('Huddersfield',   'GB', 53.6450, -1.7798, 15000),
  ('York',           'GB', 53.9600, -1.0873, 15000),
  ('Newcastle',      'GB', 54.9783, -1.6178, 20000),
  ('Sunderland',     'GB', 54.9069, -1.3838, 15000),
  ('Middlesbrough',  'GB', 54.5742, -1.2350, 15000),
  ('Hull',           'GB', 53.7457, -0.3367, 20000),
  ('Aberdeen',       'GB', 57.1497, -2.0943, 20000),
  ('Dundee',         'GB', 56.4620, -2.9707, 15000),
  ('Inverness',      'GB', 57.4778, -4.2247, 20000),
  ('Swansea',        'GB', 51.6214, -3.9436, 20000),
  ('Belfast',        'GB', 54.5973, -5.9301, 20000),
  ('Bournemouth',    'GB', 50.7192, -1.8808, 15000),
  ('Ipswich',        'GB', 52.0567, 1.1482,  15000),
  ('Luton',          'GB', 51.8787, -0.4200, 15000),
  ('Peterborough',   'GB', 52.5695, -0.2405, 15000),
  ('Northampton',    'GB', 52.2405, -0.9027, 15000),
  ('Milton Keynes',  'GB', 52.0406, -0.7594, 15000),
  ('Wolverhampton',  'GB', 52.5870, -2.1288, 15000),
  ('Wigan',          'GB', 53.5448, -2.6318, 15000),
  ('Wakefield',      'GB', 53.6830, -1.4956, 15000),
  ('Barnsley',       'GB', 53.5529, -1.4790, 15000),
  ('Doncaster',      'GB', 53.5228, -1.1285, 15000),
  ('Blackburn',      'GB', 53.7500, -2.4847, 15000),
  ('Burnley',        'GB', 53.7893, -2.2479, 15000),
  ('Stockport',      'GB', 53.4106, -2.1575, 15000),
  ('Warrington',     'GB', 53.3900, -2.5970, 15000),
  ('Telford',        'GB', 52.6766, -2.4469, 15000),
  ('Lincoln',        'GB', 53.2307, -0.5406, 15000),
  ('Grimsby',        'GB', 53.5675, -0.0750, 15000),
  ('Carlisle',       'GB', 54.8951, -2.9382, 20000),
  ('Perth',          'GB', 56.3950, -3.4308, 15000),
  ('Stirling',       'GB', 56.1166, -3.9369, 15000),
  ('Wrexham',        'GB', 53.0462, -2.9927, 15000)
ON CONFLICT (country_code, lower(name)) DO NOTHING;
