-- ============================================================
-- Fix seed data correlations:
--   1. Fix word-name avatars -> emoji avatars + ALTER DEFAULT
--   2. Move forum topics to their correct forums
--   3. Fix 5 nook descriptions
--   4. Recalculate forum topic_count
-- Idempotent: uses UPDATE ... WHERE to target only rows that
-- still have the wrong values.
-- ============================================================

DO $$
DECLARE
  -- Forum IDs looked up by name
  f_diversity         uuid;
  f_entrepreneurship  uuid;
  f_industry          uuid;
  f_interview         uuid;
  f_leadership        uuid;
  f_mental_health     uuid;
  f_salary            uuid;
  f_tech_careers      uuid;
  f_women             uuid;
  f_worklife          uuid;

  -- Emoji array for deterministic avatar assignment
  emojis text[] := ARRAY['🚀','⭐','⚡','🔥','❄️','🌈','☀️','🌙','🔮','💎'];
  u record;
  emoji_idx int;
BEGIN
  -- ============================================================
  -- 1. FIX AVATARS: word-names -> emojis
  -- ============================================================

  -- Direct word -> emoji mappings
  UPDATE user_profiles SET avatar = '🚀'  WHERE avatar = 'rocket';
  UPDATE user_profiles SET avatar = '⭐'  WHERE avatar = 'star';
  UPDATE user_profiles SET avatar = '⚡'  WHERE avatar = 'lightning';
  UPDATE user_profiles SET avatar = '🔥'  WHERE avatar = 'fire';
  UPDATE user_profiles SET avatar = '❄️'  WHERE avatar = 'snowflake';
  UPDATE user_profiles SET avatar = '🌈'  WHERE avatar = 'rainbow';
  UPDATE user_profiles SET avatar = '☀️'  WHERE avatar = 'sun';
  UPDATE user_profiles SET avatar = '🌙'  WHERE avatar = 'moon';
  UPDATE user_profiles SET avatar = '🔮'  WHERE avatar = 'crystal';
  UPDATE user_profiles SET avatar = '💎'  WHERE avatar = 'diamond';

  -- For rows still set to the old default 'User', pick deterministically
  -- based on a hash of the user id to get a stable emoji index 1-10
  FOR u IN SELECT id FROM user_profiles WHERE avatar = 'User' LOOP
    emoji_idx := 1 + (abs(('x' || left(replace(u.id::text, '-', ''), 8))::bit(32)::int) % 10);
    UPDATE user_profiles SET avatar = emojis[emoji_idx] WHERE id = u.id;
  END LOOP;

  RAISE NOTICE '[1/4] Avatars fixed';

  -- ============================================================
  -- 2. FIX FORUM-TOPIC MAPPING
  -- ============================================================
  -- Look up each forum ID by exact name
  SELECT id INTO f_diversity         FROM forums WHERE name = 'Diversity & Inclusion' AND is_global = true;
  SELECT id INTO f_entrepreneurship  FROM forums WHERE name = 'Entrepreneurship' AND is_global = true;
  SELECT id INTO f_industry          FROM forums WHERE name = 'Industry Insights' AND is_global = true;
  SELECT id INTO f_interview         FROM forums WHERE name = 'Interview Preparation' AND is_global = true;
  SELECT id INTO f_leadership        FROM forums WHERE name = 'Leadership Journeys' AND is_global = true;
  SELECT id INTO f_mental_health     FROM forums WHERE name = 'Mental Health' AND is_global = true;
  SELECT id INTO f_salary            FROM forums WHERE name = 'Salary & Negotiations' AND is_global = true;
  SELECT id INTO f_tech_careers      FROM forums WHERE name = 'Tech Careers' AND is_global = true;
  SELECT id INTO f_women             FROM forums WHERE name = 'Women in Tech' AND is_global = true;
  SELECT id INTO f_worklife          FROM forums WHERE name = 'Work-Life Balance' AND is_global = true;

  -- Bail out if any forum is missing
  IF f_diversity IS NULL OR f_entrepreneurship IS NULL OR f_industry IS NULL
     OR f_interview IS NULL OR f_leadership IS NULL OR f_mental_health IS NULL
     OR f_salary IS NULL OR f_tech_careers IS NULL OR f_women IS NULL
     OR f_worklife IS NULL
  THEN
    RAISE NOTICE 'One or more global forums not found -- skipping topic reassignment.';
  ELSE

    -- -------------------------------------------------------
    -- Topics 1-20: Diversity & Inclusion -- ALREADY CORRECT
    -- (no update needed)
    -- -------------------------------------------------------

    -- -------------------------------------------------------
    -- Topics 21-40: Salary & Negotiations
    -- Currently in Entrepreneurship, move to Salary & Negotiations
    -- -------------------------------------------------------
    UPDATE forum_topics SET forum_id = f_salary WHERE title IN (
      'I negotiated a 40% raise by switching teams internally — here is exactly how',
      'Pay transparency changed everything at my company',
      'The gender pay gap is real — I discovered a 25% disparity with my male peer',
      'How I negotiated remote work into my offer letter',
      'RSU negotiations: what I wish I knew before joining a public company',
      'Salary bands should be public — change my mind',
      'I turned down a promotion because the pay increase did not match the responsibility increase',
      'How I used Levels.fyi and Glassdoor to prepare for negotiations',
      'The art of negotiating when you have no competing offers',
      'Why I share my salary openly with colleagues',
      'Equity refresh conversations nobody prepares you for',
      'How being underpaid for years compounded into a massive wealth gap',
      'Contractor to full-time conversion: negotiating what you are worth',
      'The hidden costs of relocation packages nobody mentions',
      'How I negotiated a sign-on bonus to offset unvested equity',
      'Salary negotiation scripts that actually worked for me',
      'Why you should negotiate benefits, not just base salary',
      'The psychological barrier of asking for more money as a first-gen professional',
      'How my mentor helped me realize I was undervaluing myself by 50K',
      'What happened when I asked HR for the salary range during the first interview'
    );

    -- -------------------------------------------------------
    -- Topics 41-60: Mental Health
    -- Currently in Industry Insights, move to Mental Health
    -- -------------------------------------------------------
    UPDATE forum_topics SET forum_id = f_mental_health WHERE title IN (
      'Burnout almost ended my career — the signs I wish I had not ignored',
      'How therapy changed my relationship with work',
      'ADHD in the workplace: strategies that actually help',
      'The anxiety of being on-call and how I learned to manage it',
      'Why I told my manager about my depression — and what happened next',
      'Meditation and mindfulness helped me survive a toxic workplace',
      'The mental health impact of constant Slack notifications',
      'How I set boundaries with a workaholic team without being ostracized',
      'Grief at work: when personal loss meets professional expectations',
      'The link between imposter syndrome and anxiety — my therapy journey',
      'How exercise became my most effective productivity tool',
      'Seasonal depression and remote work — a dangerous combination',
      'The stigma of taking mental health days in competitive industries',
      'How I rebuilt my confidence after a PIP that destroyed my self-worth',
      'Compassion fatigue in people management — a silent epidemic',
      'Why companies need to stop gamifying wellness',
      'The mental load of being the only minority on a team',
      'How journaling helped me process workplace trauma',
      'Sleep deprivation in startup culture is not a badge of honor',
      'Finding a therapist who understands workplace discrimination'
    );

    -- -------------------------------------------------------
    -- Topics 61-80: Women in Tech
    -- Currently in Interview Preparation, move to Women in Tech
    -- -------------------------------------------------------
    UPDATE forum_topics SET forum_id = f_women WHERE title IN (
      'Being interrupted in meetings: strategies that actually worked for me',
      'The motherhood penalty is real — how I navigated it',
      'How I built confidence to speak at my first tech conference',
      'The "glass cliff" — why women get leadership roles only during crises',
      'Navigating pregnancy announcements in a male-dominated team',
      'Why I started a women-in-tech lunch group and how it changed our culture',
      'The backlash against women who negotiate aggressively',
      'How I dealt with a male colleague who kept explaining my own code to me',
      'Building technical credibility when people assume you are non-technical',
      'The career cost of being the "team mom" — and how I stopped',
      'Why I left a high-paying job for a company with better gender representation',
      'How mentorship from senior women accelerated my career',
      'The double standard in performance reviews for women vs men',
      'Returning to tech after a career break — it is possible',
      'How I raised my hand for stretch assignments that scared me',
      'The pay gap between women of color and white women in tech',
      'Why "leaning in" is not enough — we need systemic change',
      'How I navigated sexual harassment and kept my career intact',
      'Building a personal board of directors as a woman in tech',
      'The unspoken rules of executive presence for women'
    );

    -- -------------------------------------------------------
    -- Topics 81-100: Tech Careers
    -- Currently in Leadership Journeys, move to Tech Careers
    -- -------------------------------------------------------
    UPDATE forum_topics SET forum_id = f_tech_careers WHERE title IN (
      'Switched from finance to software engineering at 34 — lessons from the trenches',
      'The truth about staff engineer promotions nobody tells you',
      'How I got my first tech job without a CS degree',
      'IC vs management track — how I decided and why I switched back',
      'The diminishing returns of LeetCode grinding',
      'How I built a portfolio that actually landed interviews',
      'Remote work changed my career trajectory as someone from a small town',
      'The reality of tech layoffs — what I learned from being let go twice',
      'How I transitioned from QA to software engineering',
      'Why I chose a startup over FAANG (and do not regret it)',
      'The best career advice I ever received from a stranger on LinkedIn',
      'How contributing to open source opened doors I never expected',
      'The myth of the 10x engineer and why it is harmful',
      'Career development when your manager does not care about your growth',
      'How I pivoted from frontend to machine learning engineering',
      'The unwritten rules of getting promoted at Big Tech companies',
      'Why I stopped chasing titles and started chasing impact',
      'How networking events feel different when you are the only minority',
      'The career impact of choosing a boring but stable tech stack',
      'How I negotiated a four-day work week as a senior engineer'
    );

    -- -------------------------------------------------------
    -- Topics 101-120: Leadership Journeys
    -- Currently in Mental Health, move to Leadership Journeys
    -- -------------------------------------------------------
    UPDATE forum_topics SET forum_id = f_leadership WHERE title IN (
      'First-generation professional navigating executive leadership — imposter syndrome is real',
      'What I learned managing a team of 50 as a 28-year-old',
      'The loneliness of leadership nobody talks about',
      'How I give feedback that actually changes behavior',
      'Leading through a layoff — the hardest thing I have ever done',
      'Why I fired my best performer for creating a toxic environment',
      'How I learned to delegate when my identity was tied to doing everything myself',
      'The difference between being a boss and being a leader',
      'How I built trust with a team that had been burned by previous managers',
      'Managing up: how I influenced leadership without formal authority',
      'The leadership skills I learned from being a parent',
      'How I handled my first direct report crying in a one-on-one',
      'Leading a distributed team across 5 time zones — what I wish I knew',
      'Why I publicly admit my mistakes to my team',
      'The transition from individual contributor to manager nearly broke me',
      'How I create space for introverts in a culture that rewards extroverts',
      'Leading with vulnerability: why showing weakness made me stronger',
      'The political skills nobody teaches in management training',
      'How I sponsor underrepresented talent in promotion cycles',
      'What servant leadership actually looks like in practice'
    );

    -- -------------------------------------------------------
    -- Topics 121-140: Interview Preparation
    -- Currently in Salary & Negotiations, move to Interview Preparation
    -- -------------------------------------------------------
    UPDATE forum_topics SET forum_id = f_interview WHERE title IN (
      'How I prepared for system design interviews as a self-taught developer',
      'The behavioral interview questions that tripped me up — and how I mastered them',
      'Why I bombed my dream company interview and what I learned',
      'Cracking the coding interview when English is your second language',
      'How I prepared for 5 interviews simultaneously without losing my mind',
      'The take-home assignment debate — are they fair or exploitative?',
      'How I got comfortable with whiteboard coding in front of strangers',
      'Interview red flags I wish I had noticed before accepting offers',
      'How I used the STAR method to nail every behavioral question',
      'The reality of interview bias — when your name affects your callback rate',
      'How mock interviews with peers tripled my confidence',
      'Preparing for executive-level interviews — it is a different game',
      'How I tackled algorithm problems with a liberal arts background',
      'The importance of asking YOUR questions during interviews',
      'How I overcame interview anxiety with cognitive behavioral techniques',
      'Why culture fit interviews can be a cover for discrimination',
      'How I negotiated timeline extensions during multi-round interviews',
      'The emotional toll of rejection after final-round interviews',
      'How I prepared for product management interviews coming from engineering',
      'Interview preparation as a working parent — realistic strategies'
    );

    -- -------------------------------------------------------
    -- Topics 141-160: Work-Life Balance
    -- Currently in Tech Careers, move to Work-Life Balance
    -- -------------------------------------------------------
    UPDATE forum_topics SET forum_id = f_worklife WHERE title IN (
      'Setting boundaries as a new parent in a startup culture that glorifies overwork',
      'How I stopped checking email after 6 PM and my career survived',
      'The myth of work-life balance — I prefer work-life integration',
      'How I manage a chronic illness while meeting deadlines',
      'The guilt of leaving on time when everyone else is still working',
      'How I negotiate flex schedules for caregiving responsibilities',
      'Remote work boundaries: when your home becomes your office 24/7',
      'How I reclaimed my weekends from "just a quick Slack message"',
      'The impact of PTO guilt on underrepresented employees',
      'How I structure my day as a parent with school pickup duties',
      'Why unlimited PTO is a scam at most companies',
      'How I maintained my hobbies while working 50-hour weeks',
      'The cost of hustle culture on long-term career sustainability',
      'How I convinced my team to adopt meeting-free Fridays',
      'Navigating religious observance in a 24/7 work culture',
      'How I handle the pressure to be always available as a remote worker',
      'The art of saying no to extra projects without limiting your career',
      'How I found community outside of work when work consumed my identity',
      'Taking a sabbatical at 30 — the best career decision I ever made',
      'How I manage energy, not time — and why it changed everything'
    );

    -- -------------------------------------------------------
    -- Topics 161-180: Entrepreneurship
    -- Currently in Women in Tech, move to Entrepreneurship
    -- -------------------------------------------------------
    UPDATE forum_topics SET forum_id = f_entrepreneurship WHERE title IN (
      'Raising my first round as a Black founder — the unspoken barriers nobody talks about',
      'How I bootstrapped a SaaS to 10K MRR while working full-time',
      'The founder loneliness nobody warns you about',
      'How I found my co-founder after three failed partnerships',
      'Building a startup as an immigrant — visa challenges and workarounds',
      'Why I left Big Tech to build something that serves my community',
      'The reality of founder mental health — beyond the hustle narrative',
      'How I built a business around a problem I experienced as a minority',
      'Customer discovery when your target market is underrepresented',
      'The fundraising double standard for women founders — data and strategies',
      'How I pivoted my startup three times before finding product-market fit',
      'Building an inclusive hiring process from day one at my startup',
      'The hidden costs of entrepreneurship nobody puts in their blog posts',
      'How I balanced consulting income with building my product',
      'Why I chose a B-Corp structure over a traditional C-Corp',
      'How my side project became my main project in 6 months',
      'The accelerator experience — was it worth the equity?',
      'Building a diverse advisory board that actually advises',
      'How I raised a friends-and-family round without wealthy friends or family',
      'The art of pitching when you do not fit the "founder archetype"'
    );

    -- -------------------------------------------------------
    -- Topics 181-200: Industry Insights
    -- Currently in Work-Life Balance, move to Industry Insights
    -- -------------------------------------------------------
    UPDATE forum_topics SET forum_id = f_industry WHERE title IN (
      'AI is not replacing us — but people who use AI will replace people who do not',
      'The real impact of the tech downturn on underrepresented professionals',
      'Why the four-day work week is inevitable — and who benefits most',
      'How remote work is reshaping hiring for non-coastal candidates',
      'The ethics of AI hiring tools and their impact on diversity',
      'Why DEI programs are being cut and what we can do about it',
      'The rise of employee activism and how companies are responding',
      'How Web3 promises decentralization but replicates existing inequities',
      'The gig economy and its disproportionate impact on marginalized workers',
      'Climate tech: the next frontier for purpose-driven careers',
      'How the semiconductor shortage revealed supply chain fragility and opportunity',
      'The growing demand for cybersecurity professionals from non-traditional backgrounds',
      'Why healthcare tech is the most impactful sector nobody talks about',
      'The future of education technology and equitable access',
      'How fintech is reaching underbanked communities — opportunities and risks',
      'The state of unionization in tech and what it means for workers',
      'How ESG investing is changing corporate behavior on diversity',
      'The talent pipeline problem — what companies get wrong about sourcing diverse candidates',
      'Why cross-industry experience is becoming more valuable than deep specialization',
      'The next wave of regulation on AI and what engineers need to know'
    );

    RAISE NOTICE '[2/4] Forum topics reassigned to correct forums';

  END IF; -- end forum null check

  -- ============================================================
  -- 3. FIX 5 NOOK DESCRIPTIONS
  -- ============================================================

  UPDATE nooks
     SET description = 'Every day I toggle between two versions of myself — the polished corporate one and the real one. By Friday I am so drained from performing that I barely have energy for the people who actually know me. Anyone else feel like they are living a double life?'
   WHERE title = 'The toll of code-switching between professional and community spaces';

  UPDATE nooks
     SET description = 'After I raised concerns about team dynamics, my desk was quietly relocated to a corner near the emergency exit. Nobody explained why. It feels like professional exile and I am questioning whether this was intentional retaliation.'
   WHERE title = 'My company moved my desk away from my team — feels like isolation';

  UPDATE nooks
     SET description = 'The recruiter asked for my current compensation and I made the mistake of sharing. Their offer was barely 5K more. I later discovered the role pays 40K above what they offered me. Looking for strategies to recover from this or negotiate up.'
   WHERE title = 'How to handle a recruiter who lowballs based on your current salary';

  UPDATE nooks
     SET description = 'Every time I need to ask a question, I run a mental calculation: will this confirm what they already think about people like me? The result is either struggling in silence or over-preparing to the point of exhaustion. There has to be a middle ground.'
   WHERE title = 'The challenge of asking for help without confirming negative stereotypes';

  UPDATE nooks
     SET description = 'One year ago I was terrified of leading a team. Today, not a single person has left. They say it is because I actually listen and follow through. Turns out the bar for good management is surprisingly low — and that is both encouraging and sad.'
   WHERE title = 'Celebrating: just completed my first year as a manager with a 100% retention rate';

  RAISE NOTICE '[3/4] Nook descriptions fixed';

  -- ============================================================
  -- 4. RECALCULATE FORUM TOPIC COUNTS
  -- ============================================================
  UPDATE forums f
     SET topic_count = (
           SELECT count(*)
             FROM forum_topics ft
            WHERE ft.forum_id = f.id
         )
   WHERE f.is_global = true;

  RAISE NOTICE '[4/4] Forum topic counts recalculated';

END $$;

-- ============================================================
-- ALTER the column default from 'User' to the rocket emoji
-- (outside DO block so it is a proper DDL statement; idempotent)
-- ============================================================
ALTER TABLE user_profiles ALTER COLUMN avatar SET DEFAULT '🚀';
