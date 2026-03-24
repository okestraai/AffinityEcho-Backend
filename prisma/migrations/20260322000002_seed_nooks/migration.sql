-- ============================================================
-- Seed nooks with timestamps within the last 24 hours.
-- The original seed migration failed to insert nooks.
-- This re-runs the nook seeding with corrected date logic.
-- ============================================================

DO $$
DECLARE
  user_ids   uuid[];
  user_ct    int;
  n_id       uuid;
  i          int;
  j          int;
  u_idx      int;
  now_ts     timestamptz := now();

  nook_title_ct   int;
  nook_desc_ct    int;

  -- Nook titles (same 194 entries from original seed)
  nook_titles text[] := ARRAY[
    'Just got passed over for promotion again',
    'Dealing with microaggressions from a well-meaning team',
    'Anyone else terrified about return-to-office mandates?',
    'Navigating a toxic manager without burning bridges',
    'Feeling guilty about quiet quitting but I am so burnt out',
    'How do you handle being called the diversity hire?',
    'First week at a new job and I already feel like I do not belong',
    'Layoff survivor guilt is destroying my productivity',
    'Code-switching exhaustion — can I just be myself at work?',
    'Celebrating wins — I just got my dream job offer!',
    'My manager just took credit for my idea in front of the VP',
    'Imposter syndrome is hitting hard today',
    'Does anyone else dread Monday mornings?',
    'How do you network when you are the only minority at events?',
    'I found out I am being paid 30K less than my white colleague',
    'The anxiety of waiting for performance reviews',
    'My accent is affecting my career and I do not know what to do',
    'Should I leave a high-paying job that is killing my mental health?',
    'Experiencing retaliation after filing an HR complaint',
    'Celebrating: first time seeing someone who looks like me in leadership',
    'The emotional toll of always having to prove yourself',
    'Anyone else exhausted by performative allyship?',
    'I think my company is about to do layoffs — how to prepare',
    'Being a first-gen college student in a room full of Ivy Leaguers',
    'My team does not respect my technical skills because of my gender',
    'Struggling with the decision to come out at work',
    'My manager told me I need to be less emotional',
    'Has anyone successfully changed a toxic team culture?',
    'The loneliness of being a remote-only worker',
    'I just found out my company is cutting DEI programs',
    'Dealing with racial trauma while maintaining professionalism',
    'How to ask for mental health accommodations without stigma',
    'My religious practices make me feel like an outsider at work',
    'The invisible labor of being the office translator',
    'I got promoted but the team does not respect my authority',
    'Anyone else struggling with the cost of being professional (hair, clothes, etc)?',
    'My company says they value diversity but all the leaders look the same',
    'The weight of representing your entire community in meetings',
    'I just reported harassment and I am terrified of the consequences',
    'How do you handle clients who are biased?',
    'Finding community when you are the only one like you at work',
    'The double standard of emotional expression at work',
    'My parental leave was approved but my team is resentful',
    'How to handle being constantly mistaken for someone else of your race',
    'The pressure to be a role model when you are just trying to survive',
    'I think my recruiter screened me out because of my name',
    'Coping with a PIP that feels racially motivated',
    'The toll of explaining basic concepts about my identity to colleagues',
    'How do you handle salary discussions when you know the gap exists?',
    'My company values hustle culture and I physically cannot keep up',
    'Being an older worker in a youth-obsessed tech culture',
    'When your ERG feels like more unpaid work',
    'I want to mentor but I barely have my own career figured out',
    'The anxiety of being visible as an underrepresented leader',
    'How to ask your manager for a reference when you are job searching secretly',
    'My company just removed remote work options and I have a disability',
    'Dealing with gossip about your background in the office',
    'The pressure to assimilate versus staying authentic',
    'I was denied a promotion because I am "not ready" — for the third time',
    'How do you celebrate your heritage at work without tokenism?',
    'My team building events always involve alcohol and I do not drink',
    'The fear of being seen as a complainer when raising DEI issues',
    'I am the only parent on my team and feel judged for my schedule',
    'How to navigate political discussions at work as a minority',
    'My company donated to causes that conflict with my values',
    'The exhaustion of always being "on" in predominantly white spaces',
    'How to protect your energy when workplace drama is constant',
    'I regret not negotiating my salary — can I renegotiate after starting?',
    'The pressure to perform perfectly because failure reflects on your community',
    'Finding safe spaces to vent when work gets overwhelming',
    'My company is diverse at junior levels but homogeneous at the top',
    'How to handle a colleague who keeps asking about your immigration status',
    'The emotional cost of watching less qualified peers get promoted',
    'I feel invisible in meetings even when I have the most expertise',
    'Navigating workplace friendships when power dynamics are unequal',
    'My manager expects me to be the spokesperson for my race',
    'The struggle of building wealth from a first-generation starting point',
    'How to maintain your identity when corporate culture demands conformity',
    'I was told I am too aggressive — but my white colleagues call it confident',
    'The Sunday scaries are getting worse every week',
    'How to find a therapist who understands workplace discrimination',
    'My company wants me to share my diversity story for their marketing',
    'The guilt of succeeding when people from my community are struggling',
    'How to handle being the most junior but also the most "diverse" in the room',
    'My mentor ghosted me and I do not know what I did wrong',
    'The pressure to network in spaces that were not designed for you',
    'I am being managed out and I think it is because of my identity',
    'How to respond when someone says "I do not see color"',
    'The financial stress of student loans while peers had family support',
    'Imposter syndrome in grad school as a first-gen student',
    'My company culture revolves around drinking and I am in recovery',
    'How to advocate for yourself without being labeled difficult',
    'The challenge of finding housing in expensive tech hubs on an entry salary',
    'My manager makes jokes about my culture and thinks it is bonding',
    'The toll of being hyper-visible and invisible at the same time',
    'How to handle being left out of informal mentoring networks',
    'I just realized my company has zero Black people in senior leadership',
    'The pressure to choose between career advancement and authenticity',
    'How to support a colleague facing discrimination without overstepping',
    'The exhaustion of fighting for basic respect at work every single day',
    'Just had a panic attack before a big presentation',
    'My disability accommodation request was denied — what now?',
    'The loneliness of being a queer person in a conservative industry',
    'How to recover from a career setback that feels impossible',
    'My coworker makes microaggressions and thinks they are compliments',
    'Celebrating: my ERG just got real budget approval!',
    'The weight of carrying community trauma to the workplace',
    'How to handle being constantly interrupted in technical discussions',
    'My company is outsourcing our entire department overseas',
    'The challenge of managing up when your manager is part of the problem',
    'I want to leave but golden handcuffs are real',
    'How to build confidence when imposter syndrome is screaming',
    'The cost of visibility: when success makes you a target',
    'My team does sprint planning during my prayer time',
    'Dealing with the aftermath of a workplace investigation',
    'The myth of pulling yourself up by your bootstraps',
    'How to handle feedback that feels racially coded',
    'My manager scheduled a surprise PIP meeting and I feel blindsided',
    'The challenge of re-entering the workforce after incarceration',
    'Celebrating: I just got my green card after 12 years',
    'How to cope when your company takes a political stance you disagree with',
    'The pressure to perform during a personal crisis',
    'My colleague reported me for being aggressive — I was just direct',
    'How to handle being the youngest leader in the room',
    'The challenge of advocating for your child with a disability while working',
    'My company DEI training felt more harmful than helpful',
    'Dealing with stereotypes about my nationality in the workplace',
    'The financial burden of professional development as a first-gen professional',
    'How to handle a toxic skip-level manager',
    'My team building events exclude people with disabilities',
    'The pressure to constantly educate yourself on DEI issues',
    'Celebrating: my mentee just got their dream job',
    'How to handle workplace bullying disguised as "tough love"',
    'The challenge of maintaining work relationships after a promotion',
    'My manager wants me to train my replacement — should I refuse?',
    'The struggle of finding work-life balance in healthcare',
    'How to handle being called "articulate" as a compliment',
    'My company is implementing AI tools and I am worried about bias',
    'The pressure to be grateful for opportunities instead of advocating for equity',
    'How to build a career in tech without connections',
    'My team lead creates a culture of fear and nobody speaks up',
    'The cost of relocating for a job when you have no financial safety net',
    'Celebrating: finally found a company where I feel I belong',
    'How to cope when your identity is a political talking point',
    'The challenge of being a working parent without family support nearby',
    'My performance review was full of subjective criteria I cannot control',
    'How to handle salary negotiation when you come from a culture that avoids conflict',
    'The pressure to pick between caretaking and career advancement',
    'My company just hired a DEI officer — is this real change or window dressing?',
    'Dealing with the anxiety of an upcoming reorg',
    'How to find allies in a company where nobody talks about identity',
    'The challenge of building a professional wardrobe on an entry-level salary',
    'My remote work request was denied despite proven productivity',
    'The emotional toll of interviewing while employed at a toxic company',
    'Celebrating: my grassroots DEI initiative just got executive sponsorship',
    'How to handle being asked where you are really from in professional settings',
    'The challenge of being a non-native English speaker in meetings',
    'My company wellness program ignores cultural health practices',
    'The pressure to over-prepare for every meeting because mistakes are amplified',
    'How to recover your confidence after being gaslit by management',
    'My visa situation makes it impossible to negotiate or leave — feeling trapped',
    'The struggle of mental health stigma in my cultural community AND at work',
    'Celebrating: our team just hired its most diverse cohort ever',
    'How to handle feeling tokenized at company events',
    'The cost of conforming versus the risk of being authentic',
    'My manager penalizes me for taking sick days for mental health',
    'How to handle a colleague who constantly polices your tone',
    'The challenge of finding mentors who understand intersectional experiences',
    'Celebrating: just won a company award and fighting the urge to downplay it',
    'My company said budget cuts mean no raises this year — but executives got bonuses',
    'The pressure to attend networking events that happen during family time',
    'How to respond when your work is attributed to your identity not your skill',
    'Dealing with survivor guilt after mass layoffs at my company',
    'The challenge of being openly religious in a secular tech culture',
    'Celebrating: started a scholarship fund for first-gen tech workers in my community',
    'How to handle being seen as a threat when you are just good at your job',
    'The struggle of navigating a new city alone after relocating for work',
    'My company promotes "family" culture but does not support actual families',
    'How to stay motivated when progress on DEI feels painfully slow',
    'The challenge of building savings when you are supporting extended family',
    'Celebrating: my daughter told me she wants to be an engineer like me',
    'How to maintain hope in a world that constantly questions your belonging',
    'The weight of being the first and knowing you might be the last',
    'My skip-level keeps scheduling 1:1s — should I be worried?',
    'The challenge of dating while also dealing with work discrimination stress',
    'How to handle being volunteered for DEI work you did not sign up for',
    'The pressure to succeed because you were given an "opportunity" others were not',
    'Celebrating: launched a peer mentoring program at my company',
    'The toll of code-switching between professional and community spaces',
    'My company moved my desk away from my team — feels like isolation',
    'How to handle a recruiter who lowballs based on your current salary',
    'The challenge of asking for help without confirming negative stereotypes',
    'Celebrating: just completed my first year as a manager with a 100% retention rate'
  ];

  nook_descriptions text[] := ARRAY[
    'Third cycle in a row. My manager says I need more "executive presence" but cannot define what that means. Need to vent and hear if others have cracked this.',
    'My team is genuinely trying to be inclusive, but the constant comments are draining. How do you address this without becoming the office educator?',
    'My company just announced 5 days in-office. I relocated during COVID for family reasons. Remote work made my career accessible.',
    'My manager takes credit for my work in front of leadership and then nitpicks everything I do in private. I need advice on next steps.',
    'I used to go above and beyond. After two years of no raise and watching less qualified peers advance, I have started doing the bare minimum.',
    'A colleague said to my face that I was only hired because of DEI. I was top of my class. The anger is still fresh.',
    'Everyone seems to know each other from previous companies. I come from a completely different background — no network, no shared references.',
    'Half my team was laid off last week. The people who stayed are expected to absorb all the work. How are others coping?',
    'I spend so much energy adjusting my speech, my hair, my mannerisms. By Friday I am drained not from the work itself but from performing.',
    'After 8 months of searching, 47 applications, and 12 final rounds, I got an offer at a company where the VP of Engineering looks like me.'
  ];

  nook_msg_templates text[] := ARRAY[
    'I hear you completely. You are not alone in this experience.',
    'This happened to me too. What worked was documenting every interaction and finding an ally in HR.',
    'Thank you for creating this space. I have been carrying this same weight and had nobody to talk to.',
    'My advice: start building your exit plan now while you process the emotions. You deserve better.',
    'Sending solidarity. Some days the only thing you can do is survive and that is enough.',
    'I navigated this exact situation last year. Feel free to reach out — I have templates and scripts that helped.',
    'The fact that we need anonymous spaces to discuss this says everything about workplace culture.',
    'You have more power than you realize. Document, strategize, and protect yourself.',
    'Real talk: therapy helped me process workplace situations like this in a way that friends could not.',
    'This is systemic, not personal. That does not make it hurt less, but it might help to know it is not about you.',
    'One thing I learned: you do not owe anyone your energy. Protect it fiercely.',
    'Rooting for you from here. Your experience matters and your feelings are valid.',
    'I brought this exact issue to our ERG and it led to a policy change. Sometimes speaking up works.',
    'The isolation is the hardest part. Knowing others understand helps more than solutions sometimes.',
    'Take care of yourself first. You cannot fight for equity if you are burnt out.',
    'This made me feel less alone. I have been questioning whether I was overreacting.',
    'Your courage in sharing this will help someone who is reading but too afraid to post.',
    'I do not have advice but I have empathy. Sometimes that is what matters most.',
    'Start a paper trail today. Even if you do not use it now, future-you will thank you.',
    'You belong. You earned your place. Do not let anyone make you question that.'
  ];

  urgencies text[] := ARRAY['low','medium','high'];
  temperatures text[] := ARRAY['cool','warm','hot'];
  scopes text[] := ARRAY['company','global'];
  nook_rxn_types text[] := ARRAY['heard','validated','inspired'];

BEGIN
  SELECT array_agg(id ORDER BY created_at)
    INTO user_ids
    FROM user_profiles
   WHERE is_deleted = false AND is_deactivated = false;

  user_ct := coalesce(array_length(user_ids, 1), 0);

  IF user_ct < 2 THEN
    RAISE NOTICE 'Need at least 2 users. Found %. Skipping.', user_ct;
    RETURN;
  END IF;

  nook_title_ct := coalesce(array_length(nook_titles, 1), 0);
  nook_desc_ct  := coalesce(array_length(nook_descriptions, 1), 1);

  -- ============================================================
  -- SEED NOOKS with members, messages, and reactions
  -- All timestamps randomized within the last 24 hours
  -- ============================================================
  FOR i IN 1..nook_title_ct LOOP
    IF NOT EXISTS (SELECT 1 FROM nooks WHERE title = nook_titles[i]) THEN
      n_id := gen_random_uuid();
      u_idx := (i - 1) % user_ct;

      INSERT INTO nooks (
        id, creator_id, title, description,
        urgency, scope, temperature, hashtags,
        members_count, messages_count, views_count,
        is_active, is_locked,
        created_at, updated_at, last_activity_at, expires_at
      ) VALUES (
        n_id,
        user_ids[1 + u_idx],
        nook_titles[i],
        nook_descriptions[1 + ((i - 1) % nook_desc_ct)],
        urgencies[1 + (i % 3)],
        scopes[1 + (i % 2)],
        temperatures[1 + ((i + 1) % 3)],
        ARRAY['#' || replace(lower(split_part(nook_titles[i], ' ', 1)), '''', ''),
              '#' || replace(lower(split_part(nook_titles[i], ' ', 2)), '''', ''),
              '#workplace'],
        3 + (i % 5),
        4 + (i % 4),
        20 + (i * 3) % 80,
        true,
        false,
        -- created_at: random time 2-24 hours ago
        now_ts - ((2 + (i * 37 % 22)) || ' hours')::interval - ((i * 13 % 60) || ' minutes')::interval,
        -- updated_at: random time 1-12 hours ago
        now_ts - ((1 + (i * 19 % 11)) || ' hours')::interval - ((i * 7 % 60) || ' minutes')::interval,
        -- last_activity_at: random time 0-6 hours ago
        now_ts - ((i * 11 % 6) || ' hours')::interval - ((i * 23 % 60) || ' minutes')::interval,
        -- expires_at: random time 1-24 hours from now
        now_ts + ((1 + (i * 17 % 23)) || ' hours')::interval
      );

      -- Add 3-7 members
      FOR j IN 0..LEAST(2 + (i % 5), user_ct - 1) LOOP
        INSERT INTO nook_members (
          id, nook_id, user_id, is_anonymous, notifications_enabled,
          messages_sent, joined_at, last_read_at
        ) VALUES (
          gen_random_uuid(),
          n_id,
          user_ids[1 + ((u_idx + j) % user_ct)],
          true, true,
          CASE WHEN j < 3 THEN 1 + (j % 3) ELSE 0 END,
          -- joined_at: 1-20 hours ago
          now_ts - ((1 + (i * 31 + j * 7) % 19) || ' hours')::interval - (((i + j) * 17 % 60) || ' minutes')::interval,
          -- last_read_at: 0-3 hours ago
          now_ts - (((i + j) * 11 % 3) || ' hours')::interval - (((i + j) * 29 % 60) || ' minutes')::interval
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

      -- Add 4-7 messages from different members
      FOR j IN 1..(4 + (i % 4)) LOOP
        INSERT INTO nook_messages (
          id, nook_id, user_id, content, is_anonymous,
          heard_count, validated_count, helpful_count, inspired_count,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          n_id,
          user_ids[1 + ((u_idx + j) % user_ct)],
          nook_msg_templates[1 + ((i + j * 3) % 20)],
          true,
          (i + j) % 10,
          (i + j * 2) % 8,
          (i + j * 3) % 12,
          (i + j) % 6,
          -- created_at: 1-22 hours ago, staggered by j so messages are ordered
          now_ts - ((1 + (i * 29 % 18) + (8 - j)) || ' hours')::interval - (((i + j) * 41 % 60) || ' minutes')::interval,
          now_ts - ((1 + (i * 29 % 18) + (8 - j)) || ' hours')::interval - (((i + j) * 41 % 60) || ' minutes')::interval
        );
      END LOOP;

      -- Add nook-level reactions (2-5 per nook)
      FOR j IN 1..LEAST(2 + (i % 4), user_ct) LOOP
        INSERT INTO nook_reactions (id, nook_id, user_id, reaction_type, created_at)
        VALUES (
          gen_random_uuid(),
          n_id,
          user_ids[1 + ((u_idx + j + 2) % user_ct)],
          nook_rxn_types[1 + ((i + j) % 3)],
          -- reaction: 0-20 hours ago
          now_ts - (((i + j) * 23 % 20) || ' hours')::interval - (((i + j) * 37 % 60) || ' minutes')::interval
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

    END IF;
  END LOOP;

  RAISE NOTICE 'Seeded % nooks with members, messages, and reactions (all within last 24 hours)', nook_title_ct;

END $$;
