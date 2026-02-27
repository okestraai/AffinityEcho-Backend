-- ============================================================
-- Seed 200 Forum Topics, 200 Nooks, and Feed Posts per user
-- All distributed across every active user in the database
-- Idempotent: skips if seed data already exists
-- ============================================================

DO $$
DECLARE
  -- user + forum arrays
  user_ids   uuid[];
  user_ct    int;
  forum_ids  uuid[];
  forum_ct   int;

  -- working variables
  t_id       uuid;
  c_id       uuid;
  n_id       uuid;
  m_id       uuid;
  fp_id      uuid;
  i          int;
  j          int;
  k          int;
  u_idx      int;
  f_idx      int;
  now_ts     timestamptz := now();

  -- array length helpers (to safely handle arrays with < 200 entries)
  nook_title_ct   int;
  nook_desc_ct    int;
  tags_csv_ct     int;

  -- ========== TOPIC CONTENT ARRAYS (200 entries) ==========
  topic_titles text[] := ARRAY[
    -- Diversity & Inclusion (1-20)
    'How I found my voice as the only Black woman on my engineering team',
    'Navigating religious identity in a secular workplace',
    'Building an ERG from scratch — lessons from year one',
    'The invisible tax of being a "diversity spokesperson"',
    'Why I stopped hiding my disability at work',
    'Intersectionality in tech: being queer AND a person of color',
    'How my company responded when I reported a microaggression (and what I wish they did instead)',
    'The myth of meritocracy: how bias hides in "objective" criteria',
    'Creating psychological safety for neurodivergent team members',
    'Why diversity without inclusion is just window dressing',
    'Confronting anti-Asian bias after returning to the office',
    'How I built a coalition of allies across departments',
    'The emotional labor of educating colleagues about my culture',
    'When your accent becomes a barrier to promotion',
    'Colorism within communities of color — an uncomfortable truth',
    'Age discrimination in tech is real and we need to talk about it',
    'How I navigate being openly trans in a conservative industry',
    'The double bind of being a strong Black woman in leadership',
    'Why I mentor young professionals who look like me',
    'How to be a genuine ally without making it about yourself',

    -- Salary & Negotiations (21-40)
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
    'What happened when I asked HR for the salary range during the first interview',

    -- Mental Health (41-60)
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
    'Finding a therapist who understands workplace discrimination',

    -- Women in Tech (61-80)
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
    'The unspoken rules of executive presence for women',

    -- Tech Careers (81-100)
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
    'How I negotiated a four-day work week as a senior engineer',

    -- Leadership Journeys (101-120)
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
    'What servant leadership actually looks like in practice',

    -- Interview Preparation (121-140)
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
    'Interview preparation as a working parent — realistic strategies',

    -- Work-Life Balance (141-160)
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
    'How I manage energy, not time — and why it changed everything',

    -- Entrepreneurship (161-180)
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
    'The art of pitching when you do not fit the "founder archetype"',

    -- Industry Insights (181-200)
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
  ];

  topic_contents text[] := ARRAY[
    -- D&I (1-20)
    'For three years I sat in meetings and let ideas slide. One day my skip-level manager told me she valued dissent — and that changed everything. I started documenting my contributions, asking for credit in public, and it snowballed. How have others navigated being "the only" in their space?',
    'I practice a faith that requires daily prayers. Finding a quiet space in an open-plan office felt impossible until I asked facilities for help. The response surprised me — they converted a storage room. Sometimes you just need to ask.',
    'When I proposed an ERG at my company, leadership said "we support it but have no budget." Here is how I built it anyway: volunteer leads, borrowed meeting rooms, and grassroots Slack channels. One year later we have 200 members and a real budget.',
    'Every panel, every all-hands Q&A, every "can you review this for cultural sensitivity?" — the requests pile up. I love advocating but it became a second unpaid job. I learned to set limits: two events per quarter, max.',
    'I have an invisible disability that affects my energy levels. For years I pushed through and crashed every Friday. When I finally disclosed to my manager and got accommodations, my work quality improved dramatically. Vulnerability can be strategic.',
    'People want to put me in one box. Am I here for the LGBTQ panel or the BIPOC panel? The answer is both, and the intersection creates unique challenges neither community fully addresses. We need more intersectional spaces.',
    'I reported a comment to HR and they scheduled a "mediation" between me and the person — as if I was equally responsible. I learned that documenting patterns, not isolated incidents, is more effective. Keep a running log.',
    'Our "blind" resume review still filtered by school name and previous company. True meritocracy requires examining every single filter we use. I proposed removing school names and the quality of candidates improved.',
    'My autistic colleague was struggling with mandatory "team bonding" activities. I advocated for optional participation and written agendas for meetings. Small changes, huge impact on inclusion.',
    'Our company has 47% diverse hiring but only 12% diverse leadership. The pipeline is not the problem — the culture of belonging is. Diversity gets people in the door; inclusion keeps them.',
    'After the Atlanta shootings, nobody at work acknowledged it. I sent an email to my team sharing how I was feeling. The silence was broken and three other Asian colleagues reached out privately to thank me.',
    'I identified allies in engineering, marketing, and HR. We meet monthly to coordinate efforts. Individual voices get ignored; a cross-functional coalition gets budgets approved.',
    'A colleague asked me to explain Diwali for the third year in a row. I finally said: "I appreciate your interest — here is a great article." Redirecting to resources preserves your energy.',
    'I was told I needed to "soften" my accent for client calls. I pushed back: my accent reflects my global experience, which is exactly why clients hired us. My manager backed down.',
    'Within my own community, lighter-skinned colleagues get different treatment. This conversation is uncomfortable but necessary. Inclusion work must include intra-community equity.',
    'At 45, I was told I was "not a culture fit" at three startups. What they meant: I was not 25. I found a company that values experience and it has been the best role of my career.',
    'Coming out as trans at work meant re-introducing myself to 200 colleagues. HR updated my records in a day. Some colleagues struggled with pronouns for months. Patience and persistence matter.',
    'I am expected to be strong, assertive, and resilient at all times. But I am also human. I cry. I get frustrated. The "strong Black woman" trope is a cage disguised as a compliment.',
    'Every young professional I mentor who looks like me is one more person who does not have to figure it out alone like I did. The ROI on mentoring is generational.',
    'True allyship means giving up something: speaking time, a board seat, a project lead. If your allyship costs you nothing, question if it is allyship at all.',

    -- Salary (21-40)
    'Most people think you need to leave a company to get a real raise. I proved that wrong by gathering competing offers and having an honest conversation with my director about comp alignment. They matched within a week.',
    'When our company published salary bands, the conversations shifted from awkward to productive. Suddenly everyone could see where they stood. The initial discomfort was worth the long-term trust.',
    'I discovered my male peer with identical experience and performance ratings was making 25% more. I presented the data to HR. They adjusted my salary AND started a company-wide audit.',
    'Remote work is a form of compensation. I quantified it: no commute saves me $400/month and 10 hours/week. I factored this into my negotiation and it was a game changer.',
    'RSU vesting schedules are designed to keep you locked in. I learned to negotiate for front-loaded vesting and larger initial grants. The difference over 4 years was $150K.',
    'Every company has salary bands. If they tell you they do not, they are hiding them. Ask directly. If they refuse, that is a red flag about the culture.',
    'The new role had a fancy title and a 5% raise. But the scope tripled. I did the math: my effective hourly rate would drop by 30%. I said no and asked for a proper package.',
    'I spent two weeks researching comp data before my review. I came with a printed packet: market data, my accomplishments, and a specific number. My manager said nobody had ever been so prepared.',
    'When you have no leverage, you build it. I spent 6 months making myself indispensable on a critical project, then negotiated during the most important sprint. Timing is everything.',
    'I post my salary on a shared doc that my team can access. It made me uncomfortable at first, but it has helped three junior colleagues negotiate better offers.',
    'My company does annual equity refreshes but nobody explains how they work. I learned the hard way that a "refresh" does not reset your grant — it adds incrementally. Know your comp structure.',
    'Starting at a low salary compounded over 10 years. By the time I realized, I was 30% behind peers. Salary history bans are crucial legislation. Never share your current salary to new employers.',
    'Going from $85/hr contractor to $130K salary seemed like a pay cut, but with benefits, PTO, and 401K match, the total comp was actually higher. Always compare total compensation.',
    'My relocation package covered moving costs but not the 40% increase in rent. I was effectively taking a pay cut to move to a more expensive city. I negotiated a cost-of-living adjustment.',
    'I lost $80K in unvested equity by leaving. My new company gave me a sign-on bonus to cover the gap. You can negotiate for this — most candidates do not know.',
    'Script 1: "Based on my research and the value I bring, I am looking for a base salary of $X." Script 2: "I am excited about this role. To make this work, I need $Y." Script 3: "I have a competing offer at $Z. I prefer your company — can you match?"',
    'I negotiated an extra week of PTO, a home office stipend, and a learning budget instead of fighting over base salary. Sometimes the non-monetary benefits add up to more.',
    'Growing up, my family never discussed money. When I entered the corporate world, salary negotiation felt physically uncomfortable. My mentor literally practiced with me 10 times before my first negotiation.',
    'My mentor looked at my offer letter and said: "You are worth $50K more than this." I did not believe her. She was right. I was comparing myself to my previous salary, not to the market.',
    'The recruiter was visibly surprised when I asked for the salary range in our first call. She shared it immediately. The range was $30K above what I would have asked for.',

    -- Mental Health (41-60)
    'I was working 70-hour weeks for 18 months straight. The turning point: a therapist told me burnout is not weakness, it is your body protecting itself. I took FMLA, came back part-time, and rebuilt.',
    'I resisted therapy for years — in my culture, you do not talk about feelings with strangers. But work anxiety was affecting my sleep, my relationships, everything. Finding a therapist who shared my background made all the difference.',
    'ADHD made open-plan offices torture. Noise-canceling headphones, time-blocking, and body doubling are my survival kit. I also told my manager I work better with written instructions than verbal ones.',
    'Being on-call gave me constant low-level anxiety. I could not enjoy weekends or vacations. I proposed a rotation restructure: on-call for one week, fully off for three. It changed our team culture.',
    'I told my manager I have depression during a particularly bad episode. She responded with empathy and helped me access short-term disability. Not every manager will react this way, but mine showed me what good leadership looks like.',
    'I meditate for 10 minutes every morning before checking any device. It sounds small but it transformed my relationship with the constant urgency of Slack and email. I respond now instead of reacting.',
    'I analyzed my screen time and realized I was receiving 200+ Slack notifications per day. I turned off all non-essential notifications and my anxiety dropped measurably within a week.',
    'My team had a culture of "last one to leave wins." When I started leaving at 5:30 PM, there were comments. After a month of consistent boundaries (and consistent delivery), the comments stopped.',
    'My father passed away and I came back to work after three days because I felt I could not take more time. I wish I had taken the full bereavement leave. Grief does not follow corporate timelines.',
    'My therapist helped me see that imposter syndrome and generalized anxiety were feeding each other. Treating the anxiety made the imposter feelings more manageable. They are connected.',
    'I started running during my lunch break instead of eating at my desk. The afternoons went from sluggish to my most productive hours. Physical health is not separate from mental health.',
    'Winter remote work in a small apartment with minimal sunlight nearly broke me. I invested in a SAD lamp, forced myself outside for 20 minutes at noon, and scheduled video calls to see human faces.',
    'My company offers unlimited PTO but I tracked actual usage: the average was 8 days per year. I took 20 days and got a "concerns about commitment" comment in my review. The system is broken.',
    'Getting put on a PIP felt like being told I was worthless. It took six months of therapy to separate my professional performance from my self-worth. I eventually left for a company that valued me.',
    'Managing a team of 12 while everyone brought me their problems took a toll I did not expect. I started having panic attacks before 1:1s. A management coach taught me to hold space without absorbing pain.',
    'My company launched a meditation app benefit and called it a mental health initiative. Meanwhile, they expected 60-hour weeks and had zero boundaries. Band-aids on bullet wounds.',
    'Being the only person of color on my team means I carry the weight of representation in every interaction. That mental load is invisible to others but very real to me.',
    'I journal for 15 minutes every evening about what went well and what triggered me at work. Over time, patterns emerged that helped me have better conversations with my manager about my needs.',
    'Our CTO bragged about sleeping 4 hours a night. Three team members ended up in the hospital from stress-related issues that year. Sleep deprivation culture kills — literally.',
    'Finding a therapist who understood what it is like to be the only Brown person in a room at work was transformative. Generic advice like "just be confident" does not cut it.',

    -- Women in Tech (61-80)
    'I tracked it for a month — I was being interrupted 4 times per meeting. Here is what worked: "I would like to finish my thought" said firmly, pre-sharing agenda items in writing, and building an "amplification pact" with other women.',
    'After announcing my pregnancy, my high-profile project was reassigned "to reduce my stress." Nobody asked me what I wanted. I had to fight to keep my scope. The assumption that motherhood means less ambition is pervasive.',
    'My hands were shaking at the podium. 500 people staring at me. But I had practiced 30 times and I knew my material cold. After my talk, three women came up and said I inspired them to submit proposals.',
    'Research shows women are promoted into leadership during crises because the risk of failure is high and there is less competition from men. Recognize when you are being set up on a glass cliff.',
    'When I announced my pregnancy, one colleague said "there goes your promotion track." I documented it, reported it, and got promoted six months later. Do not let others set your timeline.',
    'Eight women meeting monthly for lunch turned into a support network, then a mentoring circle, then a pipeline for promotions. Small groups create big change when they persist.',
    'My male colleague told me I was "too aggressive" in negotiations. The same week, he was praised for being "assertive." Same behavior, different word. I started naming this double standard openly.',
    'He literally re-explained the API I had designed and built. In the meeting I designed to present it. I waited until he finished, then said: "Thank you for summarizing my work. Let me add the details."',
    'In my first week, three people assumed I was in marketing, not engineering. I now introduce myself with: "Hi, I am [name], I am the lead engineer on [project]." Front-loading your technical credibility saves time.',
    'I was the "team mom" — organizing birthdays, taking notes, ordering lunch. When I stopped, the team was confused. I redirected that energy to technical projects and my visibility skyrocketed.',
    'I left a company paying $50K more for one where 40% of engineering leadership are women. The salary difference was offset by faster promotions, better projects, and not being the "only one."',
    'My skip-level manager, a woman VP, sponsored me for a project I would never have gotten otherwise. She saw something in me before I saw it in myself. That is the power of senior women lifting others.',
    'My review said I was "collaborative but not assertive enough." My male peer with the same style was described as "a team player with strong leadership potential." We compared reviews and presented the data to HR.',
    'I took 3 years off for caregiving. Getting back into tech was terrifying. A returnship program at a major company gave me the bridge I needed. These programs save careers.',
    'I volunteered for a migration project nobody wanted. It was high-risk and unglamorous. But it gave me visibility with the CTO and led directly to my promotion. Sometimes the best opportunities are the ones nobody wants.',
    'The stat that should concern everyone: women of color in tech earn $0.62 for every dollar white men earn. This is not just a gender issue — it is an intersection of gender AND race.',
    'Systemic problems require systemic solutions. Individual women leaning in harder will not fix broken promotion processes, biased performance reviews, or hostile cultures.',
    'I went to HR, filed a formal complaint, went through an investigation, and the person was moved to another team. It took 6 months and immense emotional labor. But I would do it again.',
    'My board of directors includes: a technical mentor, a career strategist, a peer who keeps me honest, and a sponsor in senior leadership. Curate your support network intentionally.',
    'I was told I need to "command the room" more. When I asked what that looked like, nobody could describe it without using examples of male leaders. Executive presence standards need to be redefined.',

    -- Tech Careers (81-100)
    'After 10 years in investment banking, I taught myself to code and made the jump. The hardest part was not the skills — it was the identity shift. My ego took a hit, but my quality of life improved 10x.',
    'The staff engineer promotion is not about writing better code. It is about influence, communication, and solving organizational problems. I spent too long optimizing for the wrong skills.',
    'I applied to 150 jobs with no CS degree. What finally worked: contributing to open source to build a portfolio, networking at meetups, and targeting companies that value skills over pedigree.',
    'I switched from IC to management and back to IC twice. Neither path is better — the question is what energizes you right now. And "right now" can change.',
    'After 500 LeetCode problems, I realized diminishing returns kicked in around problem 150. The rest of my time was better spent on system design and behavioral prep.',
    'My portfolio project — a full-stack app solving a real problem I cared about — generated more interview conversations than my resume ever did. Build things that matter to you.',
    'I grew up in rural Mississippi. Remote work meant I could access six-figure tech jobs without moving to a coastal city. This is the most underrated equity benefit of the remote revolution.',
    'Getting laid off the first time felt like failure. The second time, it felt like freedom. I started freelancing and now make more than I ever did full-time with better work-life balance.',
    'QA engineers understand software better than most developers realize. My testing mindset made me a better engineer because I think about edge cases by default.',
    'The startup pays less but I own actual equity, make real decisions, and see my code in production the same day. The learning velocity is 10x what I got at a big company.',
    'A stranger on LinkedIn messaged me: "Your career path is not linear and that is your biggest asset." It reframed how I saw my non-traditional background.',
    'I submitted a PR to a popular open source project and it got merged. The maintainer connected me with a hiring manager at their company. Open source is the ultimate networking tool.',
    'The 10x engineer myth creates toxic dynamics where one person becomes a single point of failure while others are devalued. Great engineering is a team sport.',
    'I asked my manager for a development plan and she said "just keep doing what you are doing." So I wrote my own plan, shared it with skip-level, and created my own growth trajectory.',
    'I went from building React components to training ML models. The transition took 18 months of evening study. The key: I found projects at work that let me apply ML to frontend problems.',
    'Promotions at Big Tech are not about doing great work — they are about doing visible great work at the right scope with documented impact. Learn the game even if you do not agree with the rules.',
    'I stopped chasing Staff Engineer and started chasing problems I cared about. Ironically, the title followed because passion produces better outcomes than ambition alone.',
    'At every networking event I attend, I am the only person who looks like me. It is exhausting but I keep going because visibility matters and because I have met incredible people.',
    'I chose PostgreSQL and Django over the latest framework. My career has been stable for 8 years while others chased every new technology. Sometimes boring is brilliant.',
    'I negotiated Fridays off by offering a 10% pay cut. My output on four focused days exceeds what I produced in five fragmented ones. My manager agreed to a trial and it became permanent.',

    -- Leadership (101-120)
    'Neither of my parents went to college. I am now a Director at a Fortune 500. Every day I walk into rooms where everyone else seems to have unwritten rules memorized. I have learned to own my story instead of hiding it.',
    'Half my team was more experienced than me. The key to earning respect: I asked them what they needed instead of telling them what to do. Leadership is service, not authority.',
    'Nobody tells you that being a leader means eating lunch alone sometimes. Your team needs to vent about work, and they cannot do that with you at the table. I found my own support network of peer leaders.',
    'I replaced the "feedback sandwich" with radical candor: caring personally while challenging directly. It was uncomfortable at first but my team said they finally trusted that my praise was genuine.',
    'Announcing layoffs to my team was the worst day of my career. I committed to transparency: I shared everything I could about the business reasons and fought for the best severance packages possible.',
    'He was our top performer but left a trail of demoralized teammates. When I let him go, I lost 20% output but gained 50% team morale. Toxic brilliance is never worth it.',
    'I used to review every PR, attend every meeting, and answer every Slack message. A coach told me: "If you are the bottleneck, you are not leading — you are controlling." Letting go was terrifying but necessary.',
    'Bosses use authority to get compliance. Leaders build trust to get commitment. I learned this the hard way after my first team suffered high turnover under my command-and-control style.',
    'My team had been through three managers in two years. Nobody trusted me at first. I spent the first month just listening — no changes, no initiatives. Just understanding their pain points.',
    'I could not get a seat in the leadership meeting, so I started sending weekly summaries of my team impact to the VP. After three months, she invited me to present. Create your own visibility.',
    'Patience, active listening, conflict resolution, and managing people with completely different communication styles — all skills I learned from raising kids, not from an MBA program.',
    'I froze. I had no idea what to say. Eventually I just said: "I see you and I appreciate you trusting me with this. How can I support you?" Sometimes being present is enough.',
    'Five time zones means someone is always working outside comfortable hours. I rotate meeting times monthly so no single region bears the burden permanently. Fairness matters.',
    'In our last retro, I shared that I completely mishandled a stakeholder situation. My team opened up about their own mistakes for the first time. Vulnerability cascades downward.',
    'Going from "I built this" to "my team built this" required rewiring my brain. The first time I said "we" instead of "I" in an exec review felt like losing my identity. Now it feels like my greatest achievement.',
    'I noticed my extroverted team members dominated every discussion. I implemented async input before meetings and round-robin formats. Participation from quieter members increased 300%.',
    'The hardest moment in leadership is admitting "I do not know" in front of your team. It felt like weakness until I realized it gave them permission to be imperfect too.',
    'Nobody teaches you about office politics in management training. But navigating stakeholders, building coalitions, and managing up are 50% of the actual job. Learn it or get sidelined.',
    'Every promotion cycle I spend hours writing sponsorship cases for my underrepresented team members. It is the most impactful thing I do. Sponsorship is not optional — it is a leadership responsibility.',
    'Servant leadership is not about being nice. It is about removing obstacles, fighting for resources, and sometimes having uncomfortable conversations so your team can focus on their work.',

    -- Interview Prep (121-140)
    'System design was my weakest area without formal CS training. My study plan: read DDIA cover to cover, diagram every app I use daily, and do 15 mock interviews with peers. It worked.',
    'The question that got me was: "Tell me about a time you disagreed with your manager." I did not have a prepared answer and rambled. Now I have 10 stories mapped to common behavioral themes.',
    'I prepared for three months, felt confident, and then completely blanked during the coding round. I asked for a moment, took a deep breath, and started talking through my approach. They appreciated the recovery more than a perfect solution.',
    'Technical interviews in English when your brain thinks in Spanish require a different kind of preparation. I practiced explaining algorithms out loud in English until it became natural.',
    'I used a spreadsheet tracking company, role, stage, next action, and deadline. Without it, I would have missed follow-ups and double-booked. Treat the job search like a project.',
    'A 6-hour take-home project is not a "small assignment." It is free labor. I now ask for the expected time commitment and whether they compensate for take-homes. Companies that respect your time are worth working for.',
    'The first time I whiteboarded I wrote code so small nobody could read it. A friend taught me to use the whole board, write big, and narrate as I go. It is a performance as much as a technical exercise.',
    'The company had a "flat hierarchy" but the interview felt hierarchical. The "unlimited PTO" policy had a 5-day average. Learn to read between the lines during interviews.',
    'STAR method saved me: Situation, Task, Action, Result. I wrote 15 STAR stories covering leadership, conflict, failure, and success. I could adapt them to any question.',
    'I have a distinctly ethnic name. I ran an experiment: sent the same resume with my real name and a Westernized version. The callback rate difference was shocking. The bias starts before the interview.',
    'I did 40 mock interviews before my real ones. By the time I sat down with a Google engineer, the nervousness was gone because the format felt familiar. Repetition kills anxiety.',
    'Executive interviews focus less on technical skills and more on strategic thinking, organizational impact, and how you handle ambiguity. Adjust your preparation accordingly.',
    'I taught myself to think algorithmically by relating problems to real-world puzzles. A hash map is a library catalog. A graph is a social network. Metaphors make abstract concepts concrete.',
    'I always ask: "What does success look like in the first 90 days?" and "What is the biggest challenge the team is facing?" Their answers reveal more than any job description.',
    'I worked with a cognitive behavioral therapist specifically on interview anxiety. We used exposure therapy — progressively more stressful mock scenarios. By interview day, I felt prepared, not panicked.',
    'When a company says they hire for "culture fit," ask them to define it. If they cannot give you specifics, it often means they hire people who look and think like them.',
    'I had a final round scheduled but also a vacation planned. I asked if we could push by a week. They immediately said yes. Companies that respect your time are the ones worth working for.',
    'After 4 final-round rejections in a row, I almost gave up. A mentor told me: "Rejection is redirection." The fifth company was the best fit I could have imagined.',
    'PM interviews from engineering meant learning a new vocabulary: TAM, north star metrics, roadmap prioritization. I spent a month reading PM blogs and case studies before my first PM interview.',
    'I study from 9-10 PM after the kids are asleep. Weekends I do one mock interview. It is slow but sustainable. In 4 months, I went from failing easy problems to solving mediums consistently.',

    -- Work-Life Balance (141-160)
    'When my daughter was born, I stopped doing 10 PM deploys. I told my CTO: "I will deliver exceptional work from 8 to 5." He said he wished more people set those boundaries.',
    'The first week without checking email after hours, I had withdrawal symptoms. By week three, I realized nothing had caught fire. Most "urgent" things are not actually urgent.',
    'Balance implies equal weight. Integration means finding the rhythm that works for your season of life. Some weeks are 50 hours. Some weeks are 30. The key is overall sustainability.',
    'I have a chronic autoimmune condition that flares unpredictably. I front-load work during good periods and communicate proactively during flares. Transparency with my manager eliminated the anxiety of hiding it.',
    'I packed up at 5:30 PM while everyone was still heads-down. Nobody said anything directly but I heard whispers. Three months of consistent high-quality work on time silenced the skeptics.',
    'My mother has dementia. I need to take her to appointments twice a week. My company approved a flex schedule without hesitation. Not every company would — choose employers who accommodate real life.',
    'I worked from my couch in pajamas for 2 years. My mental health suffered because there was no separation between "work space" and "living space." Creating a dedicated workspace was transformative.',
    'My manager sent messages at 11 PM and expected responses. I started responding the next morning at 8 AM with a friendly tone. Eventually they adjusted their expectations. Boundaries are set by actions, not words.',
    'As a minority, I feel pressure to work harder to prove I deserve my spot. Taking PTO feels like giving ammunition to doubters. This internalized pressure is real and harmful.',
    'School pickup is at 3 PM. I block my calendar, handle it, and return by 3:30. My team knows and respects it. Being explicit about your constraints actually builds trust.',
    'Unlimited PTO means no PTO bank, which means nothing to pay out when you leave, and social pressure to take less. I now ask for a guaranteed minimum in my offer letters.',
    'I run, garden, and play piano. These are not luxuries — they are what keep me creative and energized at work. I protect hobby time as fiercely as I protect meeting time.',
    'I worked at a startup where the CEO slept at the office. Three of us burned out in the first year. Hustle culture is not a strategy — it is a failure of planning.',
    'Our team tried meeting-free Fridays for a quarter. Deep work increased, people used Fridays for learning, and we shipped more in 4 days than we used to in 5.',
    'Friday sundown to Saturday sundown is sacred for me. When I first asked for this accommodation, I expected resistance. Instead, my manager simply moved our Friday sync to Thursday.',
    'I am a remote worker in a company where others are in-office. The pressure to be a green dot on Slack all day is immense. I had to explicitly communicate that online status does not equal availability.',
    'Saying no to a project feels like career suicide. But saying yes to everything IS career suicide — just slower. I learned to say: "I can take this on if we deprioritize X."',
    'My entire social life was through work. When I realized this, I was terrified. I forced myself to join a volleyball league, a book club, and a community garden. Best decision of my decade.',
    'At 30, I took 3 months off between jobs. Everyone said I was crazy. I traveled, read, and reflected. I came back with more clarity and energy than any vacation could provide.',
    'I track my energy levels through the day and schedule tasks accordingly. Creative work in the morning, meetings midday, admin in the afternoon. Managing energy beats managing time.',

    -- Entrepreneurship (161-180)
    'I pitched 47 VCs before getting my seed round. The pattern: investors from similar backgrounds asked about the product, others asked about "market risk" in ways that felt like code for "I do not understand your customer."',
    'I built my SaaS in evenings and weekends. The first customer came from a tweet. By month 8, MRR hit $10K and I had validation to go full-time. Start small, ship fast, iterate.',
    'Nobody tells you that being a founder means being alone with your problems at 2 AM. I started a founder support group — 5 of us meet weekly to share openly. It saved my startup and my sanity.',
    'My first co-founder wanted to move fast and break things. My second wanted to plan everything for months. My third wanted to build something meaningful. Third time was the charm.',
    'My H-1B visa meant I could not legally work on my startup while employed. I spent a year building relationships and planning while my immigration attorney found a path forward.',
    'I left Google to build a platform for my community. My ex-colleagues thought I was crazy. Two years later, we serve 50K users and I have never been more fulfilled.',
    'Two founders in my accelerator cohort attempted suicide during the program. We do not talk enough about founder mental health. The hustle narrative is literally killing people.',
    'I grew up in a food desert. I built a tech company that connects local farmers with underserved neighborhoods. Sometimes the best startup ideas come from lived experience.',
    'Our target market — low-income communities of color — does not show up in traditional market research. We did 200 in-person interviews. That qualitative data was more valuable than any Gartner report.',
    'Women founders receive 2% of VC funding. Women of color receive 0.3%. I raised from women-led funds and angel networks. The capital is out there — you just have to know where to look.',
    'Pivot 1: B2C to B2B. Pivot 2: healthcare to education. Pivot 3: platform to marketplace. Each one felt like failure but was actually learning. Product-market fit is not found — it is earned.',
    'My first hire was a DEI consultant. People thought I was crazy spending money on that before product launch. But building inclusive from day one is exponentially cheaper than retrofitting later.',
    'Nobody mentions: lawyer fees, accounting costs, insurance premiums, the emotional cost of uncertainty, the strain on relationships. Budget for all of it — financial and emotional.',
    'I consulted three days a week at $200/hour and spent two days building my product. The consulting income covered my runway without requiring external funding. Bootstrap smartly.',
    'B-Corp certification costs more and adds complexity. But it attracts mission-aligned investors, employees, and customers. For us, the values alignment was worth every dollar.',
    'My side project hit 100 users in a month. I did not plan to start a company. Sometimes businesses find you. I transitioned gradually over 6 months.',
    'The accelerator gave us $150K for 7% equity, mentorship, and a network. Was it worth it? Yes — but only because of the network. The money and mentorship alone would not have justified it.',
    'My advisory board includes: a former CEO in my industry, a financial advisor, a community leader, and a technical architect. They actually respond to my emails. Choose advisors who show up.',
    'Friends and family round when your network is not wealthy means $500 checks from 50 people, not $25K checks from 4. It took longer but those 50 people became my most passionate evangelists.',
    'I do not look like the founders on TechCrunch. I do not have a Stanford hoodie or a garage in Palo Alto. But I have domain expertise, grit, and a community that needs what I am building.',

    -- Industry Insights (181-200)
    'I have been integrating AI tools into my workflow for a year. My output tripled. The new skill gap will not be technical — it will be about who gets access to AI training and tools.',
    'The tech downturn disproportionately affected diverse hires who were brought in during the hiring boom and were last in, first out. Seniority-based layoffs amplify existing inequities.',
    'Studies show 4-day work weeks increase productivity and improve retention. The biggest beneficiaries are parents, caregivers, and people with chronic conditions. This is an equity issue.',
    'Remote hiring opened my company to talent from 30 states. Our engineering team went from 85% coastal to 50% non-coastal. Diversity of geography brings diversity of perspective.',
    'AI resume screeners rejected candidates with employment gaps — disproportionately affecting women who took caregiving breaks. The algorithm inherited our biases. We need to audit these tools.',
    'DEI budgets were cut by 40% across the Fortune 500 this year. The work does not stop because the budget does. Grassroots initiatives, ERGs, and individual advocacy matter more than ever.',
    'Employees are organizing around climate policy, DEI commitments, and ethical AI practices. Companies that listen will retain talent. Those that do not will lose the culture war.',
    'The Web3 promise of "decentralized" governance still concentrates power among early token holders — who are overwhelmingly white men from Silicon Valley. Same power structures, new technology.',
    'Gig platforms classify workers as contractors to avoid benefits. This model disproportionately impacts workers of color who rely on these platforms. The labor classification fight is a civil rights issue.',
    'Climate tech is growing 5x faster than general tech. It offers purpose-driven work AND strong compensation. For anyone looking for impact, this sector deserves attention.',
    'The chip shortage taught us that supply chains controlled by a few players create systemic risk. There are massive opportunities in reshoring and supply chain diversification.',
    'Cybersecurity has 3.5 million unfilled positions globally. Companies that recruit from non-traditional backgrounds — military, self-taught, career changers — are finding incredible talent others overlook.',
    'Healthcare tech impacts billions of lives but gets a fraction of the attention fintech and social media receive. If you want to work on problems that matter, look here.',
    'EdTech has the potential to democratize learning, but only if products are designed for the least connected students, not the most connected ones. Equity must be in the product requirements.',
    'Fintech is reaching communities that traditional banks have ignored for decades. But we need to be vigilant that predatory practices are not repackaged with slick apps.',
    'Tech worker unions are forming at major companies. Whether you support it or not, understanding labor organization is essential for navigating the evolving tech workplace.',
    'ESG mandates are pushing companies to actually track and report diversity metrics. Money talks, and when investors demand it, companies listen.',
    'The pipeline is not the problem. We graduate enough diverse STEM candidates. The problem is hostile workplaces that push them out within 5 years.',
    'The most innovative companies I consult for have leaders with journalism, philosophy, and art backgrounds alongside engineers. Monocultures produce monoculture thinking.',
    'The EU AI Act, US executive orders on AI safety, and emerging state regulations mean every engineer needs to understand policy. Regulatory literacy is the next essential skill.'
  ];

  -- Tags stored as comma-separated strings (PL/pgSQL doesn't support 2D arrays properly)
  topic_tags_csv text[] := ARRAY[
    'representation,engineering,speaking-up', 'religion,inclusion,workplace',
    'ERG,community,grassroots', 'diversity,labor,advocacy',
    'disability,accommodation,visibility', 'LGBTQ,intersectionality,identity',
    'HR,reporting,microaggressions', 'meritocracy,bias,hiring',
    'neurodiversity,inclusion,accommodations', 'DEI,inclusion,retention',
    'anti-Asian,bias,solidarity', 'allyship,coalition,cross-functional',
    'culture,education,boundaries', 'accent,bias,promotion',
    'colorism,equity,intra-community', 'ageism,tech,discrimination',
    'transgender,workplace,identity', 'stereotypes,leadership,identity',
    'mentoring,representation,pipeline', 'allyship,action,privilege',
    'salary,negotiation,internal-mobility', 'transparency,pay,culture',
    'pay-gap,gender,equity', 'remote,compensation,negotiation',
    'RSU,equity,negotiation', 'salary-bands,transparency,fairness',
    'promotion,compensation,scope', 'salary-research,preparation,data',
    'leverage,timing,strategy', 'salary-sharing,transparency,advocacy',
    'equity-refresh,RSU,compensation', 'salary-history,compounding,equity',
    'contractor,full-time,conversion', 'relocation,cost-of-living,negotiation',
    'sign-on-bonus,equity,negotiation', 'scripts,negotiation,salary',
    'benefits,PTO,negotiation', 'first-gen,money,negotiation',
    'mentorship,salary,self-worth', 'salary-range,interview,transparency',
    'burnout,mental-health,recovery', 'therapy,culture,anxiety',
    'ADHD,workplace,accommodations', 'on-call,anxiety,rotation',
    'depression,disclosure,manager', 'meditation,mindfulness,stress',
    'notifications,anxiety,boundaries', 'boundaries,overwork,delivery',
    'grief,bereavement,work', 'imposter-syndrome,anxiety,therapy',
    'exercise,productivity,health', 'SAD,remote-work,winter',
    'PTO,unlimited,culture', 'PIP,self-worth,recovery',
    'management,compassion-fatigue,burnout', 'wellness,gamification,corporate',
    'mental-load,representation,invisible-labor', 'journaling,self-awareness,growth',
    'sleep,startup,health', 'therapy,discrimination,culturally-competent',
    'meetings,communication,advocacy', 'motherhood,bias,pregnancy',
    'public-speaking,confidence,conference', 'glass-cliff,leadership,risk',
    'pregnancy,bias,project-allocation', 'women,community,culture-change',
    'negotiation,double-standard,gender', 'mansplaining,credit,advocacy',
    'credibility,assumptions,identity', 'office-housework,visibility,career',
    'representation,compensation,culture', 'sponsorship,women,career',
    'performance-reviews,bias,gender', 'career-break,returnship,reentry',
    'stretch-assignments,growth,visibility', 'pay-gap,race,gender',
    'systemic-change,feminism,equity', 'harassment,HR,career',
    'board-of-directors,network,strategy', 'executive-presence,gender,standards',
    'career-switch,self-taught,finance-to-tech', 'staff-engineer,promotion,influence',
    'no-degree,portfolio,hiring', 'IC,management,career-path',
    'LeetCode,interview-prep,diminishing-returns', 'portfolio,projects,interviews',
    'remote-work,rural,equity', 'layoffs,freelance,resilience',
    'QA,engineering,career-transition', 'startup,equity,learning',
    'networking,LinkedIn,career-advice', 'open-source,networking,hiring',
    '10x-engineer,myth,team', 'career-development,manager,self-advocacy',
    'frontend,ML,career-pivot', 'promotion,Big-Tech,visibility',
    'impact,purpose,titles', 'networking,minority,visibility',
    'tech-stack,stability,career', 'four-day-week,productivity,negotiation',
    'first-gen,leadership,imposter-syndrome', 'new-manager,respect,listening',
    'loneliness,leadership,support', 'feedback,radical-candor,trust',
    'layoffs,leadership,transparency', 'toxic,performance,culture',
    'delegation,control,leadership', 'boss,leader,trust',
    'trust,team,listening', 'managing-up,influence,visibility',
    'parenting,leadership,skills', 'empathy,vulnerability,one-on-one',
    'distributed,timezones,fairness', 'vulnerability,mistakes,culture',
    'IC-to-manager,identity,growth', 'introverts,inclusion,meetings',
    'vulnerability,leadership,strength', 'politics,stakeholders,strategy',
    'sponsorship,promotion,equity', 'servant-leadership,obstacles,service',
    'system-design,self-taught,interviews', 'behavioral,STAR,preparation',
    'failure,learning,resilience', 'ESL,interviews,preparation',
    'job-search,organization,tracking', 'take-home,labor,respect',
    'whiteboard,coding,presentation', 'red-flags,culture-fit,interviews',
    'STAR,stories,preparation', 'bias,names,callbacks',
    'mock-interviews,confidence,practice', 'executive,interviews,strategy',
    'algorithms,self-taught,metaphors', 'questions,interviews,evaluation',
    'anxiety,CBT,interviews', 'culture-fit,discrimination,hiring',
    'timeline,respect,negotiation', 'rejection,resilience,persistence',
    'PM,career-pivot,interviews', 'parenting,study,time-management',
    'parenting,boundaries,startup', 'email,boundaries,urgency',
    'integration,balance,seasons', 'chronic-illness,transparency,accommodation',
    'leaving-on-time,boundaries,perception', 'caregiving,flex-schedule,accommodation',
    'remote,boundaries,workspace', 'Slack,boundaries,availability',
    'PTO,guilt,minority', 'parenting,schedule,flexibility',
    'unlimited-PTO,policy,equity', 'hobbies,creativity,energy',
    'hustle-culture,sustainability,planning', 'meeting-free,deep-work,productivity',
    'religion,accommodation,scheduling', 'remote,availability,communication',
    'saying-no,prioritization,career', 'community,identity,social-life',
    'sabbatical,clarity,career', 'energy-management,productivity,self-awareness',
    'fundraising,startup,venture-capital', 'bootstrapping,SaaS,side-project',
    'founder,loneliness,support', 'co-founder,partnership,alignment',
    'immigration,visa,startup', 'Big-Tech,community,purpose',
    'founder,mental-health,burnout', 'community,startup,lived-experience',
    'customer-discovery,underrepresented,research', 'women-founders,fundraising,VC',
    'pivot,product-market-fit,learning', 'DEI,hiring,startup',
    'entrepreneurship,hidden-costs,reality', 'consulting,bootstrap,runway',
    'B-Corp,values,structure', 'side-project,transition,growth',
    'accelerator,equity,network', 'advisory-board,mentorship,governance',
    'friends-family-round,bootstrapping,community', 'founder,archetype,diversity',
    'AI,future-of-work,equity', 'layoffs,diversity,seniority',
    'four-day-week,productivity,equity', 'remote-hiring,geography,diversity',
    'AI,hiring,bias', 'DEI,budget,grassroots',
    'activism,employee,corporate', 'Web3,decentralization,equity',
    'gig-economy,labor,equity', 'climate-tech,purpose,careers',
    'supply-chain,semiconductors,opportunity', 'cybersecurity,non-traditional,talent',
    'healthcare-tech,impact,careers', 'edtech,equity,access',
    'fintech,underbanked,equity', 'unions,tech,labor',
    'ESG,diversity,investing', 'pipeline,retention,workplace',
    'cross-industry,specialization,innovation', 'AI-regulation,policy,engineering'
  ];

  -- Forum distribution: map topic index (0-based) to forum name
  forum_names text[] := ARRAY[
    'Diversity & Inclusion', 'Leadership Journeys', 'Entrepreneurship',
    'Tech Careers', 'Work-Life Balance', 'Women in Tech',
    'Salary & Negotiations', 'Interview Preparation', 'Mental Health',
    'Industry Insights'
  ];

  -- ========== COMMENT TEMPLATES (30 varied templates) ==========
  comment_templates text[] := ARRAY[
    'This resonates so deeply with my own experience. Thank you for sharing.',
    'I have been through something similar. The key thing that helped me was building a support network outside of work.',
    'Can you elaborate on this? I am in a very similar situation and would love to hear more details.',
    'This is the most important conversation we should be having right now. More people need to see this.',
    'I disagree slightly — in my experience the approach that worked was being more direct about the issue early on.',
    'Saving this for reference. These are the kinds of insights you cannot find in any corporate training.',
    'As a manager, I want to hear this perspective. It helps me be better at supporting my team.',
    'The data backing this up is really compelling. I shared this with my leadership team.',
    'I tried a similar approach and it worked well, but the cultural context at each company makes a big difference.',
    'This should be required reading for every HR department. The gap between policy and reality is enormous.',
    'Thank you for being vulnerable. It takes courage to share this kind of experience.',
    'I had a completely different experience — but I think that just shows how much context matters.',
    'My mentor gave me similar advice and it changed my career trajectory completely.',
    'How did your team or manager react when you tried this approach?',
    'I have been afraid to speak up about this. Seeing others share gives me courage.',
    'This is exactly why platforms like this exist. These conversations do not happen in the open at work.',
    'Sharing my own data point: I experienced the same pattern at two different companies.',
    'What resources would you recommend for someone just starting to navigate this?',
    'The systemic issues here are real, but individual actions still matter. Both and, not either or.',
    'I appreciate the honesty. Corporate messaging around this topic is usually so sanitized.',
    'Just went through this last month. Your advice would have saved me weeks of anxiety.',
    'The intersection of race, gender, and class in this conversation is so important.',
    'I wish my company understood this. Going to share with our ERG leadership.',
    'Real talk: I almost left my company over this exact issue. Staying was only possible because of allies.',
    'This validates something I have felt for years but could never articulate clearly.',
    'Would love to connect with others who have navigated this. Strength in numbers.',
    'My skip-level manager shared a similar perspective and it completely changed how I approach this.',
    'For those in the early stages of dealing with this: it does get better, but you need to be strategic.',
    'The emotional labor in this thread alone shows how much work falls on marginalized employees.',
    'Adding another perspective: in non-US contexts, some of these dynamics play out very differently.'
  ];

  -- ========== NOOK CONTENT ARRAYS (200 entries) ==========
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
    'After 8 months of searching, 47 applications, and 12 final rounds, I got an offer at a company where the VP of Engineering looks like me.',
    'In the meeting I organized, my manager restated my exact idea and the VP praised them. I sat there stunned. How do you handle this?',
    'Just finished a major deliverable and all I can think is that someone is going to figure out I do not actually know what I am doing.',
    'The Sunday scaries have evolved into full weekend anxiety. I need to hear I am not alone in this.',
    'I walk into these events and immediately scan for anyone who looks like me. When there is nobody, the energy to network just drains away.',
    'Same role, same years of experience, same performance rating. Found out through an accidental email CC. I am shaking.',
    'Reviews are next week and the anxiety is through the roof. Last time I was told I need more "polish" with no actionable feedback.',
    'I have been told my accent makes me hard to understand. I speak three languages fluently. This feels like bias disguised as feedback.',
    'The paycheck is great but I cry every Sunday night. At what point does no amount of money justify the damage to your mental health?',
    'I filed an HR complaint two months ago. Since then my projects have been reassigned and I was left off a team offsite invite.',
    'Our new CTO is a woman of color. I literally teared up when I saw the announcement. Representation matters more than words can express.',
    'Every interaction feels like a test. Every success is met with "see, they can do it" and every mistake is met with "see, I told you."',
    'My company posts Black squares and rainbow flags but has zero diverse leadership. The performative nature of it all is maddening.',
    'Hearing whispers and seeing closed-door meetings. The writing is on the wall. What should I be doing right now to prepare?',
    'The casual references to vacation homes and trust funds make me feel like an alien. I worked two jobs to pay for college.',
    'I presented a technical solution and was told to "check with the real engineers." I AM the real engineer.',
    'I have been at this company for 5 years and nobody knows I am queer. The fear of how it might change things keeps me silent.',
    'Apparently having passion about my work is being "too emotional." My male colleague who flips tables in frustration is "passionate."',
    'Our team was in a bad place — silos, blame culture, no trust. Took 6 months but we turned it around. Happy to share what worked.',
    'My team is all in the office having spontaneous conversations and I am missing out on all of it. Remote inclusion is hard.',
    'The email went out today. Budget eliminated. The people who needed those programs most are now on their own.',
    'Processing a racist incident while having to show up professional at 9 AM the next morning is a special kind of exhaustion.',
    'I need regular breaks and a flexible schedule for my condition. How do I frame this to HR without being seen as difficult?',
    'Ramadan, prayer times, dietary needs — navigating these in a corporate environment requires constant explanation and advocacy.',
    'I am the unofficial interpreter for our Spanish-speaking clients and it is not in my job description. It is also not in my compensation.',
    'The team that used to be my peers now reports to me. The dynamics have shifted and some are openly resistant.',
    'Hair appointments, professional wardrobe, the right shoes — the financial cost of "looking professional" as a minority is a hidden tax.',
    'The careers page shows diverse faces. The org chart tells a different story. Representation in marketing is not representation in power.',
    'When I speak, I am not sharing my opinion. I am sharing THE opinion of all [identity]. The weight of that expectation is crushing.',
    'I went to HR, reported what happened, and now I am documenting everything. But the fear of retaliation is constant.',
    'A client told my manager they prefer to work with someone "more like them." My manager did not push back. Now what?',
    'It took me 8 months to find my people at this company. The search was isolating but finding even one ally changed everything.',
    'When I express frustration I am aggressive. When my colleague does the same he is passionate. The coded language is exhausting.',
    'My partner and I are both taking leave. The team reaction to my leave was very different from theirs. Gender bias in caregiving is real.',
    'For the fifth time this month, a colleague confused me with the other person of my ethnicity in the office. We look nothing alike.',
    'Everyone looks to me for guidance because of my position. But I am barely keeping it together myself. The pressure is immense.',
    'I applied with my legal name. Radio silence. Applied to the same role with an anglicized name. Got a callback in 2 days.',
    'The feedback feels subjective in ways that conveniently align with stereotypes about my background. How do I push back?',
    'Every time someone asks about my culture I have to decide: is this genuine curiosity or another microaggression? The analysis is tiring.',
    'I know I am underpaid. They know I am underpaid. But "budget constraints" keep being the excuse. When does the budget find room for equity?',
    'I have a chronic pain condition. The hustle culture expectation of 60-hour weeks is not just unsustainable — it is discriminatory.',
    'I was told I should be grateful to be in tech at my age. As if experience and wisdom have no value in this industry.',
    'Every ERG meeting, every DEI survey, every cultural event — it all falls on the diverse employees to organize. It is unpaid labor.',
    'I barely know what I am doing most days. But a junior engineer asked me for advice and I realized maybe I know more than I think.',
    'Every meeting I attend, every email I send, every Slack message — I am hyper-aware that my mistakes will be magnified.',
    'I need to start looking but my manager is the only reference who knows my current work. This is a delicate situation.',
    'ADA should protect me but the bureaucratic process is designed to exhaust you into giving up. I need advice from people who have navigated this.',
    'Overheard colleagues speculating about my background in the kitchen. The whisper network is alive and well.',
    'The corporate version of me and the real me are growing so far apart that I do not recognize myself anymore.',
    'Three times. Three different review cycles. Three different vague reasons. At what point do I accept this company will never promote me?',
    'I want to share my culture but not as a show-and-tell for the company newsletter. There is a line between celebration and extraction.',
    'Every team event involves bars. I am in recovery and each one is a minefield of awkward explanations or white lies.',
    'I raised a legitimate DEI concern in our town hall. The response: "We appreciate your feedback." Translation: noted and ignored.',
    'Pickup is at 3 PM. My schedule is clear. But the side-eyes from childless colleagues who stay until 7 PM are constant.',
    'When the conversation turns political, I have the most at stake but the least safety to speak. The privilege of "not being political" is real.',
    'My company donated to a politician who actively works against my rights. How do I reconcile this with my employment?',
    'Navigating white spaces requires a level of vigilance that is physically draining. Even on good days, the hyperawareness is always there.',
    'Every drama cycle pulls me in. I am learning to protect my energy like a finite resource because it is one.',
    'I accepted the first offer because I was desperate. Six months in, I know I left money on the table. Can I bring this up?',
    'One mistake and it reflects on my entire community. My white colleagues get to fail as individuals. I fail as a representative.',
    'Sometimes you just need to scream into the void with people who get it. Consider this nook a safe void.',
    'Diverse at the entry level, homogeneous at the C-suite. The pipeline is not leaking — it is being drained from the top.',
    'They keep asking where I am from. "Texas" is never a satisfying answer. They want me to say a country that is not the US.',
    'Watching peers who started after me get promoted first. The qualifications are there. The sponsorship is not.',
    'I present the most data, I have the most experience, and somehow my suggestions are the ones that need "more research."',
    'When your skip-level is your biggest champion but your direct manager is your biggest obstacle. How to navigate the middle.',
    'Every Monday I am asked to speak for my entire race. I am one person with one experience. My identity is not a monolith.',
    'Building generational wealth when you are the first generation to have a professional salary means supporting everyone else first.',
    'Be professional. Be authentic. Be a team player. Be yourself. These messages contradict each other in ways nobody acknowledges.',
    'Same behavior. Different words. Different consequences. And they wonder why we document everything.',
    'Every Sunday around 4 PM the dread settles in. It is gotten to the point where I cannot enjoy weekends anymore.',
    'Culturally competent therapists should not be this hard to find. My insurance network has exactly zero options.',
    'They want to feature me in their diversity campaign. My success story. My journey. But who benefits from my story being told?',
    'I made it. But people in my community are still struggling. The guilt of personal success amid collective struggle is real.',
    'Being the most junior AND the most visibly diverse means every mistake feels amplified and every success feels attributed to quotas.',
    'My mentor was supposed to champion me for promotion. Then they stopped responding to messages. No explanation. Just silence.',
    'Golf outings, yacht events, ski trips — networking in spaces designed for wealth and privilege when you have neither.',
    'The documentation is building. The pattern is clear. But proving intent is nearly impossible. I feel trapped.',
    'When someone says "I do not see color" they are saying they do not see me. My color is part of who I am. See me.',
    'Graduated with $150K in loans. My peers whose parents paid for college are buying houses. Same salary, wildly different freedom.',
    'My advisor keeps questioning whether I belong in this program. Meanwhile, less qualified students from privileged backgrounds coast.',
    'Every team happy hour. Every client dinner. Every networking event. "Do you want a drink?" is a loaded question for me.',
    'I was called difficult for advocating for fair treatment. My white colleague who threw a tantrum was called passionate.',
    'San Francisco, New York, Seattle — the tech hubs where entry-level salaries cannot cover rent. How are we supposed to start?',
    'It is not bonding. It is not a compliment. It is not funny. And your laughter makes it harder for me to speak up.',
    'Being both overlooked and over-scrutinized at the same time. The paradox of being a minority in corporate spaces.',
    'The mentors who would truly understand my experience are the ones who are already overwhelmed by their own battles.',
    'Not a single Black VP. Not one. In a company of 10,000. That is not a pipeline problem. That is a choice.',
    'Career advancement or being true to myself. I am tired of being told I can have both when every signal says otherwise.',
    'My colleague is being harassed. I want to help but I am also precarious in my position. How do I support without risk?',
    'Another day of proving my worth while watching others coast on privilege and connections. The marathon nobody signed up for.',
    'My heart was pounding so hard I thought everyone could hear it. I had to present to 200 people and I could barely breathe. Need coping strategies.',
    'I submitted all the paperwork, had my doctor fill out the forms, and HR said it does not qualify. I do not know where to go from here.',
    'Being queer in an industry where clients and leadership lean conservative means I am always calculating what is safe to share.',
    'I was on track for promotion, then one bad quarter derailed everything. How do you bounce back when it feels like the floor disappeared?',
    'They smile while saying things like "you are so exotic" and "I love your people." I do not know how to explain why that is not a compliment.',
    'We fought for that budget for two years. Today we got the email. Real money, real headcount, real programs. It is possible.',
    'A mass shooting targeting my community happened over the weekend. Monday morning I was expected to present as if nothing happened.',
    'I share technical insights and get talked over. My male colleague restates my exact point five minutes later and gets praised.',
    'They announced all our roles are moving to a lower cost center overseas. We have 60 days. The anxiety is paralyzing.',
    'My manager is the source of the toxicity and their manager does not see it. Skip-level conversations feel risky. What do I do?',
    'My unvested stock is worth $200K. But staying another two years in this environment might cost me my health. How do you decide?',
    'The voice in my head keeps saying I am a fraud. Today it is louder than usual. Please tell me this is normal.',
    'I won an innovation award and immediately a colleague made a comment about affirmative action. Success makes you a target when you are different.',
    'My Zuhr prayer falls right in the middle of sprint planning. I asked for a 15-minute shift and got told it would be "disruptive."',
    'The investigation concluded with "insufficient evidence." But now everyone knows I filed a complaint and the social dynamics have shifted completely.',
    'The narrative that anyone can make it if they just work hard enough ignores systemic barriers. I am tired of this conversation.',
    'My manager said my communication style is "too direct" but last month said I was "not assertive enough." Which is it?',
    'No warning. No prior feedback. Just a calendar invite titled "Performance Discussion." I opened it and my stomach dropped.',
    'Nobody talks about what it is like returning to work after incarceration. The background check anxiety alone is debilitating.',
    'Twelve years of visa uncertainty, job changes dictated by immigration status, and today I finally have my green card. I am free.',
    'My company publicly supports a cause I believe in but internally the culture contradicts everything they stand for externally.',
    'My parent is in the hospital and my manager asked if I can still make the deadline. The lack of basic humanity is staggering.',
    'I raised my voice once in disagreement and got reported. My colleague yells regularly and is described as passionate. The double standard is clear.',
    'Everyone in the room has 15+ years on me. The skepticism when I share ideas is palpable. How do you earn respect as a young leader?',
    'My child has special needs and navigating IEP meetings and therapy appointments while working full-time is a second full-time job.',
    'The DEI training included role plays that re-traumatized the people it was supposed to help. Good intentions do not excuse harmful execution.',
    'I am constantly asked if I am the IT person or the new intern. I am a principal engineer with 20 years of experience.',
    'Conferences, certifications, books, courses — when you do not have generational wealth, professional development comes from your own pocket.',
    'My skip-level is toxic but everyone above loves them because they deliver results. The human cost is invisible to leadership.',
    'The team offsite is at a venue with no wheelchair access. When I raised it, I was told I was being difficult.',
    'Every day there is a new article, a new outrage, a new thing I should care about. The pressure to be an informed advocate is exhausting.',
    'Watching my mentee get their dream offer was better than any of my own career wins. This is why mentoring matters.',
    'My manager calls it feedback. My therapist calls it bullying. The line between "tough management" and abuse is blurrier than people think.',
    'The people who used to be my lunch buddies now report to me. The friendly banter stopped overnight. Leadership changes everything.',
    'They want me to train someone who was hired at a higher salary to replace me. The disrespect is breathtaking.',
    'Twelve-hour shifts, emotional patients, and no time for self-care. Healthcare workers are burning out at unprecedented rates.',
    'Being told I speak well is not a compliment when the subtext is surprise that someone who looks like me can be articulate.',
    'The AI tool recommended candidates that looked exactly like the current team. When I flagged the bias, I was told the algorithm is "objective."',
    'I should be grateful? For what? For the opportunity to work twice as hard for the same recognition? Gratitude and advocacy can coexist.',
    'No referrals. No alumni network. No parents in tech. I built my career from absolute zero and it is exhausting being told to just "network."',
    'Nobody speaks up in meetings anymore. We all just nod. The fear of being the next target has silenced an entire team.',
    'I moved across the country for this job with $500 in my account. If it does not work out, I have no safety net to fall back on.',
    'After two years of feeling like an outsider, I finally found a company where I can be myself. It is not perfect but it is home.',
    'My identity is debated on the news every night. Then I go to work and pretend it does not affect me. The compartmentalization is exhausting.',
    'No grandparents nearby, no family help, daycare costs more than rent. Being a working parent without a support system is survivable but barely.',
    'My review said I need to be "more strategic" and "less tactical." No examples, no development plan, just vibes-based feedback.',
    'In my culture, you do not push back on authority. In American corporate culture, not pushing back means you get overlooked. The tension is constant.',
    'My mother needs full-time care and my company does not consider that "caregiving" the way they consider childcare. Caretaking discrimination is real.',
    'They hired a Chief Diversity Officer. She has no budget, no team, and reports to the CHRO who has resisted every DEI initiative. Theater.',
    'We just learned half the department is being restructured. Nobody knows who stays and who goes. The uncertainty is worse than the outcome.',
    'I have been here for three years and still do not have a single ally I trust enough to be real with. The loneliness is profound.',
    'Suits, shoes, dry cleaning, grooming — looking "professional" on a $45K salary in New York City means choosing between rent and appearance.',
    'My productivity metrics are higher than the team average but my request to work from home two days a week was denied. Make it make sense.',
    'Smiling through interviews while your current job is destroying you is a performance that deserves an Oscar.',
    'Two years of grassroots work, data collection, proposal writing, and today an SVP agreed to sponsor our initiative. Persistence pays.',
    'Where are you REALLY from? This question follows me everywhere — at conferences, at meetings, even at the coffee machine.',
    'I lose 30 minutes of every meeting to comprehension lag because English is my third language. By the time I formulate my point, the topic has moved on.',
    'My company offers meditation apps and yoga classes but not acupuncture or traditional medicine. Wellness should not be one-size-fits-all.',
    'I triple-check every email, rehearse every comment, and prepare double what my peers do. Because one slip and the narrative writes itself.',
    'My manager told me I was imagining things. My therapist calls it gaslighting. It took me months to trust my own perception again.',
    'My visa is tied to my employer. I cannot negotiate, I cannot leave, and they know it. The power imbalance is suffocating.',
    'In my family, therapy means you are broken. At work, not going to therapy means you are not taking care of yourself. I am caught between two worlds.',
    'Our intern class is 60% diverse. Our senior leadership is 5% diverse. Today we celebrate. Tomorrow we fight for retention.',
    'I was the only diverse person on the panel. Every question directed at me was about my identity, not my expertise. I am more than my demographic.',
    'The authentic version of me is louder, more expressive, uses different slang. The corporate version is polished, measured, exhausting.',
    'I called in sick for a panic attack and my manager asked if it was a "real" sick day. Mental health IS real health.',
    'She monitors my Slack status, counts my bathroom breaks, and comments on my lunch duration. Micromanagement is a form of control.',
    'I need a mentor who understands what it is like to be a queer woman of color in finance. That is a very specific Venn diagram.',
    'My first instinct when I won was to say "I got lucky." I am learning to say "I earned this" instead. Celebrating yourself is a skill.',
    'Executives got seven-figure bonuses while telling the rest of us there is no budget for raises. The disconnect is insulting.',
    'The networking event starts at 6 PM. My kid is bedtime at 7 PM. Every networking opportunity missed is a relationship not built.',
    'My quarterly review praised my "diversity of thought." I want to be recognized for the quality of my work, not the color of my skin.',
    'Another round of layoffs. Another round of wondering if I survived because of my skills or because they need to keep their diversity numbers up.',
    'I wear a hijab. Most days nobody comments. Some days someone stares too long. And one day someone said something I will never forget.',
    'Every dollar I earn, I send part home. I am building generational wealth from scratch while supporting people across two continents.',
    'The look on her face when she said she wants to be an engineer like me. That single moment made every struggle worth it.',
    'Some days hope is easy. Some days it requires conscious effort. Today I choose hope because the alternative is giving up.',
    'I was the first person in my family to work in corporate America. If the pipeline dries up, I might also be the last.',
    'They are not performance check-ins. They are fishing expeditions. Every question feels like a trap. Should I be updating my resume?',
    'Trying to be present for first dates when your mind is replaying the microaggression from the morning standup. Work trauma bleeds into everything.',
    'I never signed up to be on the diversity committee. I was voluntold. And saying no would make me the person who does not care about DEI.',
    'They told me I was given a chance others were not. As if my qualifications, experience, and talent had nothing to do with it.',
    'Five mentors paired, three actively meeting, connections forming across departments. This program is proof that investing in people works.',
    'At work I am professional, measured, careful. At home I am loud, funny, unapologetically myself. The switch is automatic now and that scares me.',
    'My desk used to be in the middle of the team area. Now it is in a corner by the emergency exit. Nobody explained why.',
    'The recruiter asked for my current salary and I gave it. They offered $5K more. I later learned the role paid $40K above that. Never share first.',
    'Asking for help means confirming what they already think. Not asking means struggling in silence. There is no winning move.',
    'First year managing. Zero attrition. My team said it is because I actually listen. Turns out the bar for good management is surprisingly low.'
  ];

  -- ========== NOOK MESSAGE TEMPLATES (20 response patterns) ==========
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

  -- ========== FEED POST CONTENT (50 templates per user, will be distributed) ==========
  feed_post_templates text[] := ARRAY[
    'Just wrapped up an incredible mentoring session. Helping someone navigate their first promotion conversation reminded me how far I have come. Paying it forward feels amazing.',
    'Hot take: "culture fit" interviews should be replaced with "culture add" assessments. We do not need more of the same — we need different perspectives at the table.',
    'Three years ago I almost quit tech. Today I led a company-wide presentation to 500 people. Growth is not linear but it IS possible.',
    'Reminder: your career path does not need to look like anyone else is. The winding road is still a road.',
    'Just learned about the concept of "covering" — hiding parts of your identity at work. The research on its impact on performance and belonging is eye-opening.',
    'Shout out to the managers who check in on their team is well-being, not just their deliverables. You make a bigger difference than you know.',
    'Had a conversation with a junior colleague today who was considering leaving tech altogether. We talked for an hour. Sometimes being present IS the mentorship.',
    'Finished reading "Invisible Women" by Caroline Criado Perez. Every product manager and engineer should read it. Bias in design affects lives.',
    'Small win today: successfully pushed back on a meeting that could have been an email. Protecting deep focus time is an act of self-care.',
    'The best career advice I ever received: "Your reputation is what people say about you when you leave the room." Invest in relationships, not just results.',
    'Attended my first ERG meeting today. The vulnerability in that room was something I have never experienced at work before. Found my people.',
    'Celebrating a teammate is promotion today. Watching someone you mentored succeed is the most rewarding part of this job.',
    'Unpopular opinion: unlimited PTO policies disproportionately benefit people with privilege. Those without financial cushions take fewer days off.',
    'Just had the most honest 1:1 with my manager about the challenges of being underrepresented on our team. They actually listened. Baby steps.',
    'Learning to say "I do not know" in meetings was the most powerful career move I have made. Vulnerability builds more trust than pretending.',
    'The energy it takes to be the "first" or "only" in a room is something I wish more people understood. It is not just about showing up — it is about carrying weight.',
    'Grateful for the anonymous communities that let us talk openly about workplace challenges. The honesty here has helped me more than any corporate training.',
    'Started journaling about my work experiences. Three months in and the patterns I am seeing are both validating and concerning.',
    'To everyone who applied for that job and did not get a callback: your worth is not determined by an ATS algorithm. Keep going.',
    'Real talk: I negotiated my salary for the first time today. My hands were shaking but I did it. And they said yes. You miss 100% of the shots you do not take.',
    'Just completed a coding bootcamp while working full-time. Six months of 4-hour sleep nights. Was it worth it? Ask me again in 6 months.',
    'The best teams I have been on had one thing in common: psychological safety. When people are not afraid to fail, innovation follows.',
    'Found out today that my company has a resource for first-generation professionals. The fact that this exists gives me hope.',
    'Reminder: taking a mental health day is not laziness. It is maintenance. You do not wait until your car breaks down to change the oil.',
    'Just had a conversation with a colleague from a completely different background. The perspectives they shared on our product were invaluable. Diversity IS the competitive advantage.',
    'Weekly reflection: what did I learn this week? That discomfort is not the same as danger. Growth lives in the uncomfortable zone.',
    'Celebrating small wins: I spoke up in a meeting today when I normally would have stayed silent. Nobody interrupted me. Progress.',
    'If your company DEI strategy starts and ends with a Slack channel and an annual training, it is not a strategy. It is a checkbox.',
    'The transition from IC to manager taught me that my value is no longer in what I produce, but in what I enable others to produce.',
    'To the person who is thinking about switching careers: the fear never fully goes away, but the regret of not trying is worse.',
    'Just finished a great book on inclusive leadership. Key takeaway: equity is not about treating everyone the same — it is about giving everyone what they need.',
    'My weekend project turned into something people actually want to use. Sometimes the best ideas come when you are building for yourself.',
    'The most impactful feedback I received was not about my code — it was about how I made a junior engineer feel when reviewing their PR. Kindness matters in code reviews.',
    'I used to think networking was transactional. Now I see it as community building. The shift in mindset changed everything.',
    'Wrote my first technical blog post. It is terrifying to put your thoughts out there, but the responses have been incredibly encouraging.',
    'Reminder to all the quiet leaders out there: not all leadership looks like commanding a room. Some of the best leaders lead through listening.',
    'Just had a recruiter reach out for a role I am perfect for. Six months ago I would have said I was not qualified. Imposter syndrome is a liar.',
    'The most diverse team I have ever been on was also the most innovative. Correlation is not causation, but in this case, I think it is.',
    'Spent today helping a colleague prepare for their salary negotiation. We practiced scenarios for two hours. Investment in community is investment in change.',
    'Learning that it is okay to grieve the career you thought you would have while building the career you actually need. Expectations vs reality.'
  ];

  -- urgency/temperature options for nooks
  urgencies text[] := ARRAY['low','medium','high'];
  temperatures text[] := ARRAY['cool','warm','hot'];
  scopes text[] := ARRAY['company','global'];

  -- reaction types
  topic_rxn_types text[] := ARRAY['seen','validated','inspired','heard'];
  comment_rxn_types text[] := ARRAY['helpful','supportive'];
  nook_rxn_types text[] := ARRAY['heard','validated','inspired'];
  nook_msg_rxn_types text[] := ARRAY['heard','validated','helpful','supportive'];

BEGIN
  -- --------------------------------------------------------
  -- Gather users and forums
  -- --------------------------------------------------------
  SELECT array_agg(id ORDER BY created_at)
    INTO user_ids
    FROM user_profiles
   WHERE is_deleted = false AND is_deactivated = false;

  user_ct := coalesce(array_length(user_ids, 1), 0);

  IF user_ct < 2 THEN
    RAISE NOTICE 'Need at least 2 users to seed. Found %. Skipping.', user_ct;
    RETURN;
  END IF;

  SELECT array_agg(id ORDER BY name)
    INTO forum_ids
    FROM forums
   WHERE is_global = true;

  forum_ct := coalesce(array_length(forum_ids, 1), 0);
  IF forum_ct = 0 THEN
    RAISE NOTICE 'No global forums found. Skipping.';
    RETURN;
  END IF;

  -- ============================================================
  -- 0. ENSURE ALL USERS ARE MEMBERS OF ALL GLOBAL FORUMS
  -- ============================================================
  FOR i IN 1..forum_ct LOOP
    FOR j IN 1..user_ct LOOP
      INSERT INTO forum_members (id, forum_id, user_id, joined_at)
      VALUES (
        gen_random_uuid(),
        forum_ids[i],
        user_ids[j],
        now_ts - ((user_ct - j + 1) || ' days')::interval
      )
      ON CONFLICT (forum_id, user_id) DO NOTHING;
    END LOOP;

    -- Update forum member_count
    UPDATE forums
       SET member_count = (SELECT count(*) FROM forum_members WHERE forum_id = forum_ids[i])
     WHERE id = forum_ids[i];
  END LOOP;

  RAISE NOTICE 'All users joined all % global forums', forum_ct;

  -- Calculate array lengths for safe modular indexing
  tags_csv_ct   := coalesce(array_length(topic_tags_csv, 1), 1);
  nook_title_ct := coalesce(array_length(nook_titles, 1), 1);
  nook_desc_ct  := coalesce(array_length(nook_descriptions, 1), 1);

  -- ============================================================
  -- 1. SEED 200 FORUM TOPICS with comments and reactions
  -- ============================================================
  FOR i IN 1..200 LOOP
    -- Skip if topic with this title already exists
    IF NOT EXISTS (SELECT 1 FROM forum_topics WHERE title = topic_titles[i]) THEN
      t_id := gen_random_uuid();

      -- Determine which forum (cycle through 10 forums, 20 topics each)
      f_idx := ((i - 1) / 20) % forum_ct;

      -- Determine which user creates this topic (round-robin across all users)
      u_idx := (i - 1) % user_ct;

      INSERT INTO forum_topics (
        id, user_id, forum_id, title, content, scope, is_anonymous,
        tags, affinity_groups,
        views_count, comments_count,
        reaction_seen_count, reaction_validated_count, reaction_inspired_count, reaction_heard_count,
        created_at, updated_at, last_activity_at
      ) VALUES (
        t_id,
        user_ids[1 + u_idx],
        forum_ids[1 + f_idx],
        topic_titles[i],
        topic_contents[i],
        'global',
        true,
        string_to_array(topic_tags_csv[1 + ((i - 1) % tags_csv_ct)], ','),
        CASE
          WHEN i % 5 = 0 THEN ARRAY['Women in Tech']
          WHEN i % 7 = 0 THEN ARRAY['Black professionals']
          WHEN i % 11 = 0 THEN ARRAY['LatinX in Tech']
          WHEN i % 13 = 0 THEN ARRAY['LGBTQ+ professionals']
          WHEN i % 3 = 0 THEN ARRAY['First-gen professionals']
          ELSE ARRAY[]::text[]
        END,
        -- Varying view counts
        50 + (i * 7 + i * i) % 300,
        -- Comment count (3-5 per topic, set after inserting comments)
        3 + (i % 3),
        -- Reaction counts
        10 + (i * 3) % 50,
        5 + (i * 5) % 40,
        8 + (i * 2) % 35,
        12 + (i * 4) % 45,
        now_ts - ((200 - i) || ' hours')::interval,
        now_ts - ((100 - i/2) || ' hours')::interval,
        now_ts - ((50 - i/4) || ' hours')::interval
      );

      -- Insert 3-5 comments from different users
      FOR j IN 1..(3 + (i % 3)) LOOP
        INSERT INTO forum_comments (
          id, topic_id, user_id, content, is_anonymous,
          helpful_count, supportive_count, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          t_id,
          user_ids[1 + ((u_idx + j) % user_ct)],
          comment_templates[1 + ((i + j * 7) % 30)],
          true,
          (i + j) % 15,
          (i + j * 2) % 12,
          now_ts - ((200 - i) || ' hours')::interval + (j || ' hours')::interval,
          now_ts - ((200 - i) || ' hours')::interval + (j || ' hours')::interval
        );
      END LOOP;

      -- Insert topic reactions from different users (3-8 reactions per topic)
      FOR j IN 1..LEAST(3 + (i % 6), user_ct) LOOP
        INSERT INTO topic_reactions (id, topic_id, user_id, reaction_type, created_at)
        VALUES (
          gen_random_uuid(),
          t_id,
          user_ids[1 + ((u_idx + j + 1) % user_ct)],
          topic_rxn_types[1 + ((i + j) % 4)],
          now_ts - ((200 - i) || ' hours')::interval + ((j * 2) || ' hours')::interval
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

    END IF;
  END LOOP;

  -- Update topic_count on forums
  UPDATE forums f SET topic_count = (
    SELECT count(*) FROM forum_topics ft WHERE ft.forum_id = f.id
  ), last_activity = now_ts;

  -- ============================================================
  -- 2. SEED NOOKS with members, messages, and reactions
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
        now_ts - ((200 - i) * interval '1 hour'),
        now_ts - ((100 - i/2) * interval '1 hour'),
        now_ts - ((i % 12) * interval '1 hour'),
        now_ts + ((i % 24 + 1) * interval '1 hour')
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
          now_ts - ((200 - i) * interval '1 hour') + (j || ' hours')::interval,
          now_ts - ((i % 6) * interval '1 hour')
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
          now_ts - ((200 - i) * interval '1 hour') + ((j * 2) || ' hours')::interval,
          now_ts - ((200 - i) * interval '1 hour') + ((j * 2) || ' hours')::interval
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
          now_ts - ((200 - i) * interval '1 hour') + ((j * 3) || ' hours')::interval
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

    END IF;
  END LOOP;

  -- ============================================================
  -- 3. SEED FEED POSTS (5-10 per user) with likes and comments
  -- ============================================================
  FOR u_idx IN 0..(user_ct - 1) LOOP
    -- Each user gets 5-10 posts (based on user index for variety)
    FOR j IN 1..(5 + (u_idx % 6)) LOOP
      -- Use a deterministic key to check for duplicates
      k := u_idx * 100 + j;

      -- Pick content from templates, varying by user and post number
      IF NOT EXISTS (
        SELECT 1 FROM feed_posts
        WHERE user_id = user_ids[1 + u_idx]
        AND content = feed_post_templates[1 + ((u_idx + j * 3) % 40)]
      ) THEN
        fp_id := gen_random_uuid();

        INSERT INTO feed_posts (
          id, user_id, content, visibility, is_anonymous, tags,
          likes_count, comments_count, shares_count, views_count,
          is_pinned, is_archived,
          created_at, updated_at
        ) VALUES (
          fp_id,
          user_ids[1 + u_idx],
          feed_post_templates[1 + ((u_idx + j * 3) % 40)],
          CASE WHEN j % 3 = 0 THEN 'company' ELSE 'global' END,
          j % 4 = 0,  -- 25% anonymous
          CASE
            WHEN j % 5 = 0 THEN ARRAY['career','growth']
            WHEN j % 5 = 1 THEN ARRAY['diversity','inclusion']
            WHEN j % 5 = 2 THEN ARRAY['leadership','management']
            WHEN j % 5 = 3 THEN ARRAY['mental-health','wellness']
            ELSE ARRAY['tech','industry']
          END,
          3 + (k % 25),                  -- likes_count
          1 + (k % 8),                   -- comments_count
          (k % 5),                       -- shares_count
          10 + (k % 100),               -- views_count
          false,
          false,
          now_ts - ((user_ct * 10 - k) || ' hours')::interval,
          now_ts - ((user_ct * 5 - k/2) || ' hours')::interval
        );

        -- Add 2-4 feed likes from different users
        FOR i IN 1..LEAST(2 + (j % 3), user_ct - 1) LOOP
          INSERT INTO feed_likes (id, user_id, content_type, content_id, created_at)
          VALUES (
            gen_random_uuid(),
            user_ids[1 + ((u_idx + i) % user_ct)],
            'post',
            fp_id,
            now_ts - ((user_ct * 10 - k) || ' hours')::interval + (i || ' hours')::interval
          )
          ON CONFLICT DO NOTHING;
        END LOOP;

        -- Add 1-3 feed comments from different users
        FOR i IN 1..LEAST(1 + (j % 3), user_ct - 1) LOOP
          INSERT INTO feed_comments (
            id, user_id, content_type, content_id,
            content, is_anonymous, created_at, updated_at
          ) VALUES (
            gen_random_uuid(),
            user_ids[1 + ((u_idx + i + 1) % user_ct)],
            'post',
            fp_id,
            comment_templates[1 + ((u_idx + i + j) % 30)],
            i % 3 = 0,
            now_ts - ((user_ct * 10 - k) || ' hours')::interval + ((i * 2) || ' hours')::interval,
            now_ts - ((user_ct * 10 - k) || ' hours')::interval + ((i * 2) || ' hours')::interval
          );
        END LOOP;

      END IF;
    END LOOP;
  END LOOP;

  -- ============================================================
  -- 4. Update user profile stats
  -- ============================================================
  UPDATE user_profiles up SET
    total_posts = (
      SELECT count(*) FROM forum_topics ft WHERE ft.user_id = up.id
    ) + (
      SELECT count(*) FROM feed_posts fp WHERE fp.user_id = up.id
    ),
    total_comments = (
      SELECT count(*) FROM forum_comments fc WHERE fc.user_id = up.id
    ) + (
      SELECT count(*) FROM feed_comments fc2 WHERE fc2.user_id = up.id
    );

  RAISE NOTICE 'Seed complete: 200 topics, % nooks, feed posts for % users', nook_title_ct, user_ct;

END $$;
