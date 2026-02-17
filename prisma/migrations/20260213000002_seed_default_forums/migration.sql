-- SeedDefaultForums: Bootstrap global forums + company foundation forums
-- Uses DO block to skip duplicates (checks by name + company_name + is_global).

-- ============================================================
-- Helper function for idempotent forum insert
-- ============================================================
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

-- ============================================================
-- 1. GLOBAL FORUMS (10)
-- ============================================================
SELECT seed_forum('Industry Insights',    'Cross-industry trends, news, and analysis',                    '🌐', true, NULL, 'global');
SELECT seed_forum('Leadership Journeys',  'Stories and lessons from leaders across industries',           '👑', true, NULL, 'global');
SELECT seed_forum('Entrepreneurship',     'Starting businesses, side hustles, and innovation',            '🚀', true, NULL, 'global');
SELECT seed_forum('Diversity & Inclusion','Building inclusive workplaces and celebrating differences',    '🌈', true, NULL, 'global');
SELECT seed_forum('Tech Careers',         'Career development, job hunting, and skill building',          '💻', true, NULL, 'global');
SELECT seed_forum('Work-Life Balance',    'Managing stress, burnout, and maintaining wellness',           '⚖️', true, NULL, 'global');
SELECT seed_forum('Women in Tech',        'Supporting and empowering women in technology',                '👩‍💻', true, NULL, 'global');
SELECT seed_forum('Salary & Negotiations','Compensation discussions, negotiation strategies, and pay equity','💰', true, NULL, 'global');
SELECT seed_forum('Interview Preparation','Interview tips, coding challenges, and success stories',       '📝', true, NULL, 'global');
SELECT seed_forum('Mental Health',        'Open conversations about mental health and wellbeing',         '🧠', true, NULL, 'global');

-- ============================================================
-- 2. COMPANY FOUNDATION FORUMS (5 per company × 21 companies = 105)
-- ============================================================

-- Google
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Google', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Google', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Google', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Google', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Google', 'foundation');

-- Microsoft
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Microsoft', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Microsoft', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Microsoft', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Microsoft', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Microsoft', 'foundation');

-- Apple
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Apple', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Apple', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Apple', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Apple', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Apple', 'foundation');

-- Amazon
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Amazon', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Amazon', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Amazon', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Amazon', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Amazon', 'foundation');

-- Meta
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Meta', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Meta', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Meta', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Meta', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Meta', 'foundation');

-- Netflix
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Netflix', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Netflix', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Netflix', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Netflix', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Netflix', 'foundation');

-- Tesla
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Tesla', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Tesla', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Tesla', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Tesla', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Tesla', 'foundation');

-- Goldman Sachs
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Goldman Sachs', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Goldman Sachs', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Goldman Sachs', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Goldman Sachs', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Goldman Sachs', 'foundation');

-- JPMorgan Chase
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'JPMorgan Chase', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'JPMorgan Chase', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'JPMorgan Chase', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'JPMorgan Chase', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'JPMorgan Chase', 'foundation');

-- Bank of America
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Bank of America', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Bank of America', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Bank of America', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Bank of America', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Bank of America', 'foundation');

-- Wells Fargo
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Wells Fargo', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Wells Fargo', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Wells Fargo', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Wells Fargo', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Wells Fargo', 'foundation');

-- McKinsey & Company
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'McKinsey & Company', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'McKinsey & Company', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'McKinsey & Company', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'McKinsey & Company', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'McKinsey & Company', 'foundation');

-- Boston Consulting Group
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Boston Consulting Group', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Boston Consulting Group', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Boston Consulting Group', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Boston Consulting Group', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Boston Consulting Group', 'foundation');

-- Deloitte
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Deloitte', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Deloitte', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Deloitte', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Deloitte', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Deloitte', 'foundation');

-- PwC
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'PwC', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'PwC', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'PwC', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'PwC', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'PwC', 'foundation');

-- Johnson & Johnson
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Johnson & Johnson', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Johnson & Johnson', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Johnson & Johnson', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Johnson & Johnson', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Johnson & Johnson', 'foundation');

-- Pfizer
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Pfizer', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Pfizer', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Pfizer', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Pfizer', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Pfizer', 'foundation');

-- Merck
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Merck', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Merck', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Merck', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Merck', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Merck', 'foundation');

-- Abbott
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Abbott', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Abbott', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Abbott', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Abbott', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Abbott', 'foundation');

-- Bristol Myers Squibb
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Bristol Myers Squibb', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Bristol Myers Squibb', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Bristol Myers Squibb', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Bristol Myers Squibb', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Bristol Myers Squibb', 'foundation');

-- Others
SELECT seed_forum('Career Growth',          'Advancement strategies, promotion tips, and career development', '📈', false, 'Others', 'foundation');
SELECT seed_forum('Sponsorship',            'Finding sponsors and building influential relationships',       '🤝', false, 'Others', 'foundation');
SELECT seed_forum('Bias & Microaggressions','Addressing workplace bias and microaggressions',                '⚖️', false, 'Others', 'foundation');
SELECT seed_forum('Mentorship',             'Mentor connections and guidance',                                '🎯', false, 'Others', 'foundation');
SELECT seed_forum('Wellbeing',              'Mental health, work-life balance, and self-care',               '🌱', false, 'Others', 'foundation');

-- ============================================================
-- Cleanup: drop the helper function
-- ============================================================
DROP FUNCTION IF EXISTS seed_forum;
