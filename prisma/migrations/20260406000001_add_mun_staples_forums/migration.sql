-- Add company forums for Memorial University of Newfoundland and Staples Canada
-- Uses the same seed_forum helper pattern from initial seed migration

CREATE OR REPLACE FUNCTION seed_forum(
  p_name TEXT, p_description TEXT, p_icon TEXT,
  p_is_global BOOLEAN, p_company_name TEXT, p_category TEXT
) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM forums
    WHERE name = p_name
    AND is_global = p_is_global
    AND (company_name = p_company_name OR (company_name IS NULL AND p_company_name IS NULL))
  ) THEN
    INSERT INTO "forums" ("id","name","description","icon","is_global","company_name","category",
      "topic_count","member_count","last_activity","created_at","updated_at","rules","moderators")
    VALUES (
      gen_random_uuid(), p_name, p_description, p_icon, p_is_global, p_company_name, p_category,
      0, 0, NOW(), NOW(), NOW(),
      ARRAY['Be respectful and professional in all interactions',
            'Share experiences honestly while maintaining privacy',
            'Support others and contribute constructively'],
      ARRAY[]::text[]
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Memorial University of Newfoundland
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Memorial University of Newfoundland', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Memorial University of Newfoundland', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Memorial University of Newfoundland', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Memorial University of Newfoundland', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Memorial University of Newfoundland', 'foundation');

-- Staples Canada
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Staples Canada', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Staples Canada', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Staples Canada', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Staples Canada', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Staples Canada', 'foundation');

-- Cleanup
DROP FUNCTION IF EXISTS seed_forum;
