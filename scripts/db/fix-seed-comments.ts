/**
 * fix-seed-comments.ts
 *
 * Deletes all existing forum_comments, nook_messages, and feed_comments,
 * then inserts new contextual content and recalculates counts.
 *
 * Run: npx dotenv -e .env -- ts-node scripts/db/fix-seed-comments.ts
 */

import postgres from 'postgres';

// --- DB connection -----------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(DATABASE_URL);

// --- Helpers -----------------------------------------------------------------

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function offsetMinutes(base: Date, minOffset: number, maxOffset: number): Date {
  const offset = randomInt(minOffset, maxOffset);
  return new Date(base.getTime() + offset * 60 * 1000);
}

// --- Forum comment pools (10+ per category, 10 categories = 100+ total) -----

const FORUM_COMMENT_POOLS: Record<string, string[]> = {
  'Diversity & Inclusion': [
    'Our ERG was instrumental in pushing leadership to rethink the promotion criteria that had been disadvantaging people from non-traditional backgrounds. If your company has ERGs, get involved -- they can be powerful vehicles for change.',
    'Allyship is more than wearing a pin or adding pronouns to your email signature. It means speaking up in rooms where decisions are made and redirecting credit when someone\'s contribution gets overlooked.',
    'I\'ve been documenting microaggressions I experience in meetings -- the "you\'re so articulate" comments, being mistaken for another colleague of the same race. Having a log helps when you need to escalate to HR with specifics.',
    'Representation at the leadership level matters so much. When I finally saw a VP who looked like me, it changed my entire perspective on what was possible here. Companies need to invest in pipeline, not just entry-level diversity.',
    'The invisible labor of being "the only one" in every meeting is exhausting. I\'m expected to represent an entire demographic, educate colleagues, and still deliver at the same level as everyone else. Organizations need to stop putting that burden on individuals.',
    'We pushed for inclusive parental leave policies that apply to all genders and family structures, including adoption and surrogacy. It took two years but the policy change has made a real difference in retention.',
    'Intersectionality is something most corporate DEI programs completely miss. Being a queer woman of color means I face compounding challenges that a single-axis diversity lens never captures.',
    'Code-switching is survival, not preference. I speak differently in executive meetings than I do with my team, and that constant self-monitoring is a cognitive tax that my white colleagues never have to pay.',
    'Bias in hiring is real and measurable. We ran an experiment where we anonymized resumes and the callback rate for candidates with "ethnic-sounding" names jumped by 40%. The data is undeniable.',
    'Building coalitions across different affinity groups has been the most effective strategy I\'ve seen. When the Black, Latinx, and AAPI employee groups united on a policy proposal, leadership couldn\'t ignore it.',
    'I recently attended an allyship training that was genuinely transformative -- it went beyond the basics and had us role-play intervening in real scenarios. I wish every company invested in that level of depth.',
    'The backlash against DEI programs at some companies is deeply concerning. Diversity isn\'t a trend; it\'s a business imperative backed by mountains of research showing diverse teams outperform homogeneous ones.',
  ],

  'Salary & Negotiations': [
    'The best negotiation tactic I\'ve learned: never give the first number. When they ask for salary expectations, redirect with "I\'d love to understand the full compensation philosophy and pay band for this role first."',
    'Pay band transparency changed everything at our company. Once people could see where they fell in the range, it exposed gaps that had been hidden for years. Push for this if your company doesn\'t have it.',
    'RSU vesting schedules are where companies hide the real compensation dynamics. A 4-year vest with a 1-year cliff means you\'re locked in, and the refresh grants often don\'t keep pace with the initial offer.',
    'Stop focusing only on base salary. Total compensation includes RSUs, bonuses, 401k match, health insurance premiums, and even commute costs. I built a spreadsheet to compare offers apples-to-apples and it was eye-opening.',
    'Using a competing offer is the most powerful leverage you can have. Even if you prefer Company A, getting an offer from Company B gives you concrete data to negotiate with. Always be interviewing.',
    'Salary history bans exist in many states now for good reason -- they perpetuate pay gaps from your first underpaid role all the way through your career. Know your rights and refuse to disclose if you\'re in a ban state.',
    'The gender pay gap at my company was 12% for the same role and level. We only discovered it because a few of us shared numbers openly. Salary transparency among colleagues is uncomfortable but necessary.',
    'Levels.fyi and Glassdoor gave me the data I needed to realize I was being paid $30K below market. I walked into my review with printed comparisons and got a $25K adjustment within two weeks.',
    'Sign-on bonuses are the easiest thing to negotiate because they\'re a one-time cost for the company. If they can\'t move on base, always push for a larger sign-on -- I\'ve seen $10K-$50K added just by asking.',
    'The psychology of asking for more is the biggest barrier. I practiced my negotiation pitch with a friend twenty times before the actual conversation. Rehearsal reduces anxiety and helps you hold firm when they push back.',
    'When negotiating equity, ask about the strike price, the latest 409A valuation, and the total share pool. Too many people accept stock options without understanding what their percentage ownership actually means.',
    'I made the mistake of accepting my first offer without negotiating and left $40K on the table over three years. Every job since then, I negotiate everything -- salary, equity, PTO, remote days, even professional development budget.',
  ],

  'Mental Health': [
    'Finding the right therapist took me four tries. Don\'t give up after one bad session -- therapy styles vary wildly, and the therapeutic relationship matters more than the modality. Psychology Today\'s directory lets you filter by specialty.',
    'Burnout recovery isn\'t a weekend off -- it took me three months of genuinely reduced workload to feel like myself again. If you\'re burned out, half-measures won\'t work. You need structural change, not just self-care.',
    'Getting ADHD accommodations at work was life-changing. I now have written agendas for every meeting, flexible deadlines where possible, and permission to work in 90-minute focus blocks. HR was surprisingly supportive once I provided documentation.',
    'Setting boundaries with workaholic culture means accepting that some people will think less of you. I stopped responding to Slack after 7 PM and my performance reviews are still "exceeds expectations." The fear was worse than the reality.',
    'The stigma around taking mental health days is real but fading. I started being honest -- "I\'m taking a mental health day" instead of faking a cold -- and it gave others on my team permission to do the same.',
    'Imposter syndrome and anxiety feed each other in a vicious cycle. Every time I\'m in a meeting with senior leadership, my brain tells me I don\'t belong. Cognitive behavioral techniques from therapy have helped me challenge those automatic thoughts.',
    'Journaling for 10 minutes every morning has been more impactful than any productivity hack I\'ve tried. It helps me process anxiety before it accumulates and turns into full-blown overwhelm by afternoon.',
    'Sleep hygiene transformed my mental health more than any supplement or app. No screens after 9 PM, consistent wake time even on weekends, and a cool dark room. The research on sleep and mental health is unambiguous.',
    'Compassion fatigue is real for managers, especially those of us who genuinely care about our reports\' wellbeing. I was absorbing everyone\'s stress and had nothing left for myself. Therapy helped me learn to support without absorbing.',
    'Exercise as a productivity tool isn\'t just a cliche. I started running 3 miles every morning and my focus, mood, and creative problem-solving all measurably improved. It\'s the best "work hack" that has nothing to do with work.',
    'I was skeptical about mindfulness meditation until I tried it consistently for 30 days. The ability to notice anxious thoughts without immediately reacting to them has made me a calmer colleague and a better decision-maker.',
    'If your company offers an EAP (Employee Assistance Program), use it. Most cover 6-8 free therapy sessions. It\'s how I found my current therapist, and it\'s completely confidential from your employer.',
  ],

  'Women in Tech': [
    'Being interrupted and talked over in meetings is so constant that I started keeping a tally. In one week, I was interrupted 23 times across 8 meetings. When I shared the data with my manager, he was shocked -- he hadn\'t even noticed.',
    'Mansplaining in code reviews is my particular frustration. I have 12 years of experience and a senior title, yet junior male colleagues still explain basic concepts to me as if I\'m learning. I\'ve started responding with "Yes, I\'m aware -- I wrote the RFC for that system."',
    'The motherhood penalty is quantifiable. Studies show mothers are offered $11K less on average than childless women for the same role. Meanwhile, fathers get a "fatherhood bonus." The double standard is infuriating.',
    'Returning to work after my career break was terrifying. Despite 8 years of prior experience, I was treated like a junior candidate. Programs like Path Forward and companies that specifically recruit returners made all the difference.',
    'Building technical credibility as a woman means you have to prove yourself three times over. I started contributing to high-visibility projects and presenting at internal tech talks specifically to build a visible track record.',
    'The glass cliff is real -- women and minorities are disproportionately appointed to leadership roles during crises, set up to fail, and then used as evidence that diverse leadership doesn\'t work. Watch for this pattern.',
    'Women-only networking groups gave me a safe space to discuss challenges without having to educate men in the room simultaneously. The connections I\'ve built through Women in Engineering have led to two job offers and a board seat.',
    'Negotiation backlash for women is well-documented in research. Women who negotiate are perceived as "aggressive" while men are seen as "confident." I counteract this by framing negotiations collaboratively: "I want to find something that works for both of us."',
    'Having a senior woman mentor changed my career trajectory. She helped me see that my tendency to over-prepare and over-qualify for roles was a pattern -- one she recognized because she\'d done it herself for years.',
    'Double standards in performance reviews are measurable. Research from Stanford showed women receive vague criticism ("You need to be more strategic") while men get actionable feedback ("Consider presenting to the board quarterly"). I now push back and ask for specifics.',
    'I started a "women amplification" pact with three other women on my team. When one of us makes a point in a meeting, the others repeat it and credit her. It\'s dramatically reduced the phenomenon of men repeating our ideas as their own.',
    'The pipeline problem is a myth. There are plenty of qualified women in tech -- the issue is retention. Women leave because of hostile cultures, lack of advancement, and being passed over. Fix the environment, not the pipeline.',
  ],

  'Tech Careers': [
    'Career switching from marketing to software engineering at 34 was the best decision I ever made. The bootcamp route isn\'t for everyone, but for career pivoters with strong motivation, it can compress years of learning into months.',
    'The IC vs management track decision haunted me for years. I ultimately chose to stay IC because I love the technical depth, and finding a company that values and compensates Staff Engineers properly was the key.',
    'Bootcamp vs CS degree is a false dichotomy. I did a bootcamp, then filled in CS fundamentals through MIT OCW and books like CLRS. The bootcamp got me employed; the self-study made me actually good at the job.',
    'Open source contributions are the single best way to build credibility when you don\'t have a brand-name company on your resume. I maintained a moderately popular library and it opened doors that my resume alone never could.',
    'Remote work\'s impact on career advancement is real and underappreciated. If leadership is in-office, you\'re at a disadvantage when it comes to visibility and promotion. I make a point of visiting HQ quarterly to maintain face time.',
    'LeetCode interview prep has massively diminishing returns after about 150 problems. Beyond that, you\'re memorizing patterns rather than developing problem-solving ability. Focus on understanding the "why" behind each solution.',
    'Building a portfolio project that solves a real problem is worth ten tutorial projects. My portfolio piece was a tool that my previous team actually used in production. Interviewers were far more interested in that than any toy app.',
    'Layoff recovery strategy that worked for me: take two weeks to process emotionally, then treat the job search like a full-time job with structured hours. Update LinkedIn immediately -- recruiters actively search for people marked as "open to work."',
    'Staff/principal engineer promotions require a fundamentally different skillset than senior promotions. It\'s less about code and more about technical influence, cross-team alignment, and organizational problem-solving. Start building those muscles early.',
    'Choosing between startups and big tech depends on your life stage and risk tolerance. Early career, I\'d lean startup for accelerated learning. With a mortgage and kids, big tech stability and compensation are hard to beat.',
    'The best career advice I got was "optimize for learning rate, not salary" in your first 5 years, then flip that priority. Compound learning early leads to much higher lifetime earnings than chasing the highest starting salary.',
    'I regret not building my professional network earlier. The best jobs I\'ve gotten have all come through warm introductions, not cold applications. Invest in relationships before you need them.',
  ],

  'Leadership Journeys': [
    'The biggest first-time manager challenge nobody warns you about: your old peers now report to you. The relationship dynamics shift overnight, and you have to establish authority without alienating people who were your equals yesterday.',
    'Delegation was my hardest lesson. I kept thinking "it\'s faster if I just do it myself" -- which was true short-term but completely unsustainable. Learning to delegate effectively meant accepting 80% quality initially while people learned.',
    'Giving effective feedback requires specificity and speed. "Your presentation could be better" is useless. "In slide 7, the data visualization obscured the key trend -- here\'s how I\'d restructure it" is actionable. Deliver it within 48 hours.',
    'Building team trust starts with vulnerability. I share my mistakes openly in team meetings -- not in a performative way, but genuinely. When the leader admits they don\'t have all the answers, it creates space for everyone else to be honest too.',
    'Managing distributed teams across time zones requires intentional asynchronous communication. I write detailed decision documents instead of scheduling yet another meeting. My team in Singapore shouldn\'t have to join a 10 PM call for information that could be written.',
    'Servant leadership isn\'t soft leadership. It means removing blockers relentlessly, shielding your team from organizational chaos, and making sure they have everything they need to do their best work. It\'s demanding and often thankless.',
    'Leading through layoffs was the hardest thing I\'ve ever done professionally. Being honest about what I knew and didn\'t know, showing genuine emotion, and following up individually with affected people -- there\'s no playbook that fully prepares you.',
    'Creating psychological safety means that when someone raises a concern or admits a mistake, nothing bad happens to them. I explicitly reward people who flag problems early, even when the news is uncomfortable for me.',
    'The transition from IC to manager is an identity crisis nobody talks about. Your source of validation shifts from "I built this amazing thing" to "I helped someone else build something amazing." That takes emotional recalibration.',
    'Sponsoring underrepresented talent goes beyond mentoring. A mentor gives advice; a sponsor puts their reputation on the line to advocate for someone in rooms they\'re not in. I make it a point to sponsor at least two people from underrepresented groups every year.',
    'One-on-ones are the most important meeting on my calendar. I never cancel them, I let my report set the agenda, and I listen more than I talk. The insights I get from those conversations have prevented multiple team crises.',
    'The hardest feedback I ever received was that I was a "brilliant jerk" -- technically excellent but creating a culture of fear. It took a year of intentional work with an executive coach to rebuild the trust I\'d damaged.',
  ],

  'Interview Preparation': [
    'System design interview prep is about demonstrating trade-off thinking, not memorizing architectures. Practice explaining WHY you\'d choose a particular database or messaging system, not just WHAT you\'d use. "Designing Data-Intensive Applications" is the bible for this.',
    'The STAR method for behavioral questions works if you prepare 8-10 stories that can be adapted to different prompts. I have stories for conflict, failure, leadership, ambiguity, and customer obsession -- and I can riff on any of them.',
    'Whiteboard coding anxiety nearly derailed my career. I started doing mock interviews with friends twice a week and the anxiety decreased by about 80% after a month. Exposure therapy works -- your brain learns that the situation isn\'t actually dangerous.',
    'Mock interview practice through platforms like Pramp and interviewing.io gave me realistic experience without the stakes. The feedback from strangers was often more honest and useful than what friends provided.',
    'Interview bias and name-based discrimination is well-documented. I know people who\'ve gotten dramatically more callbacks after anglicizing their names on resumes. The system is broken, and companies that truly care should use blind resume screening.',
    'The take-home assignment debate is heated, but here\'s my take: anything over 4 hours is exploitative and disproportionately disadvantages people with caregiving responsibilities. Companies should cap and compensate take-home work.',
    'Timeline negotiation during the interview process is something most candidates don\'t realize they can do. If you need an extra week to prepare or you\'re waiting on another offer, just ask. Most companies will accommodate reasonable requests.',
    'Rejection recovery is a skill. I was rejected from my dream company three times before getting an offer on attempt four. Each rejection taught me something specific, and I tracked my improvement across attempts systematically.',
    'Preparing for executive-level interviews is fundamentally different. They care less about technical minutiae and more about your vision, influence, and ability to drive business outcomes. Prepare narratives about organizational impact, not code.',
    'Asking good questions to your interviewer signals preparation and genuine interest. I always ask about the team\'s biggest unsolved problem and how they\'d measure my success at 90 days. These questions have consistently impressed hiring managers.',
    'One underrated prep technique: record yourself answering behavioral questions and watch the playback. You\'ll notice filler words, tangents, and missed opportunities to quantify impact. It\'s painful but incredibly effective.',
    'Salary negotiation at the offer stage is NOT the time to be modest. The recruiter expects you to negotiate. I was terrified my offer would be rescinded -- in 15 years and dozens of negotiations, that has literally never happened.',
  ],

  'Work-Life Balance': [
    'Setting after-hours boundaries required me to literally delete Slack from my phone. The constant notifications were eroding my evenings and weekends. My manager initially questioned it, but my productivity during working hours actually improved.',
    'PTO guilt is a trap. I used to work during vacations "just to check in" and returned more stressed than when I left. Now I set a hard boundary: OOO auto-reply, no laptop, full delegation. I come back genuinely refreshed and more creative.',
    'Parenting while working full-time in tech is an endurance sport. The guilt of missing school events or being distracted during bedtime because of a production issue never fully goes away. Finding a company that genuinely supports parents matters enormously.',
    'Meeting-free days were the single biggest quality-of-life improvement at our company. We implemented "Focus Wednesdays" and deep work output increased by an estimated 40%. If your company does not have this, lobby for it.',
    'Managing a chronic illness while maintaining a tech career requires systemic support, not just individual resilience. I have an autoimmune condition and the ability to work from home on bad days has been the difference between thriving and having to quit.',
    'Remote work boundary erosion is insidious. When your office is your home, the workday never truly ends. I created a physical "commute" -- a 15-minute walk at the start and end of each day -- to create psychological separation.',
    'My sabbatical after 7 years was the reset I did not know I needed. Three months of no work, no productivity pressure, just being. I came back with clarity on what I actually wanted from my career, not just what I was optimizing for by default.',
    'Unlimited PTO is a scam at most companies. Data consistently shows people take LESS time off under unlimited policies because there is no "use it or lose it" pressure and no clear norm. I prefer companies with generous but defined PTO.',
    'Accommodating religious observance at work should not be controversial, but I have had managers schedule critical meetings during prayer times and act surprised when I pushed back. Inclusive scheduling means knowing your team needs.',
    'Energy management vs time management was a paradigm shift for me. I stopped trying to cram more into each hour and started aligning high-energy periods with high-value work. My most creative work happens between 9-11 AM, so I protect that window fiercely.',
    'The "hustle culture" glorification in tech is burning people out by their mid-30s. I have watched brilliant colleagues flame out because they confused overwork with dedication. Sustainable pace is not laziness -- it is strategic longevity.',
    'Taking a lunch break away from your desk is radical in some workplaces. I eat lunch outside every day and it has become a non-negotiable boundary that improves my afternoon focus dramatically.',
  ],

  'Entrepreneurship': [
    'Fundraising as an underrepresented founder means hearing "no" more often and from people who cannot see themselves in your story. Only 1.4% of VC funding goes to Black founders. The data is damning, but alternative funding paths exist -- revenue-based financing, grants, and community funds.',
    'Bootstrapping forced me to be disciplined about unit economics from day one. While VC-funded competitors burned cash on growth, we were profitable by month 8. Not every business needs outside funding -- in fact, most probably should not take it.',
    'Co-founder dynamics are like a marriage. We established a "co-founder prenup" early -- a documented agreement about equity splits, decision-making authority, exit scenarios, and what happens if one of us wants out. It saved our friendship when things got hard.',
    'The immigrant founder visa challenge is Kafkaesque. I spent $15K on immigration lawyers and lived in constant anxiety about my status while simultaneously trying to build a company. The system is not designed for founders who were not born here.',
    'B-Corp vs C-Corp was a critical early decision. We chose B-Corp because our mission includes stakeholder impact, not just shareholder returns. It has attracted mission-aligned investors and talent who specifically seek out B-Corps.',
    'Accelerator equity trade-offs require careful math. Giving up 7% for Y Combinator network and brand might be worth it; giving up 10% for a no-name accelerator that offers generic mentoring probably is not. Evaluate the actual value, not just the prestige.',
    'Transitioning from a side project to my main focus required a 6-month financial runway. I saved aggressively while employed, got my first 3 paying customers before quitting, and had my spouse health insurance as a safety net. Plan the transition carefully.',
    'Building an inclusive team from day one is easier than fixing a homogeneous culture later. We wrote inclusive job descriptions, posted on diverse job boards, and used structured interviews from hire number one. Now at 30 people, our team reflects our values.',
    'The friends-and-family funding round is fraught with emotional complexity. I set clear expectations: "This money may go to zero. Only invest what you can afford to lose." Two family members still invested more than they should have, and it keeps me up at night.',
    'Pitching as a non-traditional founder -- no Stanford degree, no FAANG pedigree -- means leading with traction and metrics. VCs are pattern-matching machines; if you do not fit the pattern, your numbers need to speak louder than your background.',
    'The loneliness of entrepreneurship is the thing nobody prepares you for. Founder support groups and peer communities like Indie Hackers have been my sanity check. Do not try to do this alone.',
    'Customer discovery as a first-time founder taught me that building what I assumed people wanted was a waste of time. Talking to 50 potential customers before writing a line of code saved me from building the wrong product entirely.',
  ],

  'Industry Insights': [
    'AI impact on hiring is a double-edged sword. Automated resume screening can reduce bias if trained correctly, but most current systems replicate existing biases at scale. Companies deploying AI hiring tools need rigorous bias audits.',
    'Remote work is reshaping economic geography in fascinating ways. Tech salaries in previously low-cost areas are rising while coastal cities are losing tax revenue. The downstream effects on housing, schools, and local economies are just beginning.',
    'DEI program cuts during economic downturns reveal how many companies treated diversity as a luxury rather than a strategic priority. The companies cutting DEI first are telling on themselves -- and employees are taking note.',
    'The four-day work week data from pilot programs is overwhelmingly positive. Companies report maintained or improved productivity with significant improvements in employee wellbeing. The 5-day week is a relic of industrial-era thinking.',
    'The gig economy impact on marginalized workers is deeply troubling. People who cannot access traditional employment are funneled into gig work with no benefits, no stability, and algorithmic management that treats them as expendable.',
    'Climate tech is creating enormous opportunity for technologists who want mission-driven work. The intersection of software, hardware, and policy in areas like grid modernization and carbon capture needs diverse perspectives badly.',
    'Fintech reaching underbanked communities is one of the most impactful applications of technology I have seen. Mobile banking, micro-lending, and crypto remittances are providing financial access to people the traditional banking system ignored.',
    'Cybersecurity talent from non-traditional backgrounds is being overlooked. Some of the best security analysts I have worked with came from military, law enforcement, or were completely self-taught. The field needs to value demonstrated skill over credentials.',
    'ESG investing is evolving beyond greenwashing, but slowly. The emergence of standardized reporting frameworks and third-party verification is creating accountability. Technologists can play a role in building the measurement infrastructure.',
    'Regulation of AI in hiring is coming whether the industry likes it or not. The EU AI Act and NYC Local Law 144 are just the beginning. Companies that get ahead of regulation will have a competitive advantage in talent acquisition.',
    'The tech layoff wave has disproportionately affected H-1B visa holders who have 60 days to find new employment or leave the country. Immigration reform for skilled workers is long overdue and the current system is cruel.',
    'Web3 hype has cooled but the underlying technology still has legitimate applications in areas like supply chain verification and digital identity for underserved populations. The challenge is separating real utility from speculation.',
  ],
};

// --- Nook message pools (8+ per theme) ---------------------------------------

const NOOK_MESSAGE_POOLS: Record<string, string[]> = {
  'promotion_career': [
    'I finally got the promotion after 3 years of being told "next cycle." The thing that changed was finding a sponsor -- not a mentor, a sponsor -- who advocated for me in calibration meetings I was not in. Representation behind closed doors matters.',
    'Being passed over for promotion while training the person who got it instead was a gut punch. I am documenting everything now and having explicit conversations about what "ready" looks like. No more vague criteria.',
    'After my promotion was denied, I asked for written feedback with specific milestones for the next cycle. When I hit every single one and was still denied, I had the documentation to escalate. Got promoted the next month.',
    'The raise I negotiated was 22% -- my manager initially offered 5%. The difference was having competing offer data and being willing to walk. Companies count on your loyalty keeping you underpaid. Do not let it.',
    'Career advancement as a person of color means constantly recalibrating -- am I not getting promoted because I need to improve, or because of bias? That ambiguity is exhausting. Having honest peers who can reality-check helps enormously.',
    'I took a lateral move to a more visible team specifically for promotion positioning. Sometimes the fastest path up is sideways first. Three months later, I had the visibility that my previous role never provided.',
    'My manager told me I was not "leadership material" because I am soft-spoken. I transferred to a team that values thoughtful communication over volume, and I am now leading a 15-person org. Find environments that value your actual strengths.',
    'After 5 failed promotion cycles, I left for a company that promoted me within 6 months. Sometimes the ceiling is the company, not you. Do not waste years proving yourself to an organization that cannot see your value.',
    'The best thing I did for my career was start tracking my accomplishments weekly. When review time came, I had a comprehensive document instead of scrambling to remember what I did. Data wins arguments.',
  ],

  'bias_discrimination': [
    'Being called a "diversity hire" to my face by a colleague was devastating. I reported it to HR, but the response was "they probably did not mean it that way." The minimization was almost worse than the comment itself. Keep pushing -- document everything.',
    'Microaggressions accumulate like compound interest. Each one seems small in isolation, but the cumulative effect on your mental health and sense of belonging is massive. You are not overreacting -- the research validates what you are feeling.',
    'I filed a formal bias complaint after being excluded from a key project for the third time. The investigation was uncomfortable, but it resulted in process changes that benefited everyone. Sometimes you have to be the one who speaks up.',
    'Retaliation after reporting discrimination is illegal but common. I kept meticulous records -- emails, Slack messages, meeting notes -- and consulted an employment attorney before making my complaint. Protect yourself first.',
    'The "culture fit" excuse for rejection is often coded bias. I started asking interviewers to define "culture fit" specifically, and the answers were always revealing. Push for "culture add" language instead.',
    'DEI training at my company is performative at best. A two-hour annual workshop does not undo systemic issues. Real change requires restructured processes -- blind resume review, standardized interviews, transparent promotion criteria.',
    'Experiencing racism at work and then being expected to educate your colleagues about why it was wrong is emotional labor that should be compensated. I no longer do unpaid DEI education -- if they want my expertise, they can pay for it.',
    'I overheard a manager say they "could not risk hiring someone who might get pregnant." I reported it anonymously through our ethics hotline. The investigation led to mandatory training for all hiring managers. Bystander intervention matters.',
    'Being told to "smile more" and "be less aggressive" in reviews while my male counterparts are praised for the same assertiveness is textbook gender bias. I now ask for specific behavioral examples when I receive subjective feedback.',
  ],

  'burnout_mental_health': [
    'I did not realize I was burned out until I started crying in my car before work every morning. The signs were there for months -- insomnia, cynicism, detachment -- but I pushed through because "everyone else seemed fine." They were not fine either.',
    'Sunday scaries became Sunday paralysis. I could not eat, could not sleep, could not stop thinking about Monday. Therapy helped me realize it was not anxiety about work -- it was my body telling me the environment was toxic. I quit and the scaries disappeared.',
    'Burnout recovery took me 4 months of reduced hours, strict boundaries, and weekly therapy. My company actually supported it through a formal accommodation. If yours will not, that tells you everything about whether they deserve your loyalty.',
    'Panic attacks during sprint planning were my rock bottom. My heart racing, palms sweating, unable to speak. I told my manager the truth and she connected me with our EAP. It was the first time I felt genuinely supported at work.',
    'The stigma around mental health at work is real but shifting. When I openly said "I am taking a mental health day," three teammates privately messaged me saying they needed one too but were afraid to ask. Vulnerability creates permission.',
    'My therapist helped me see that my burnout was not just about workload -- it was about a fundamental mismatch between my values and my company values. No amount of meditation fixes a toxic environment. Sometimes the answer is to leave.',
    'I started medication for anxiety and it was a game-changer. The shame I felt about needing it was worse than the actual experience. If therapy alone is not enough, medication is a legitimate and evidence-based tool.',
    'Exhaustion is not a badge of honor. I used to brag about working 80-hour weeks until a health scare at 32 forced me to reckon with what I was doing to my body. Now I work 40 hours and I am more productive than I was at 80.',
    'Setting up a mental health support channel in our team Slack (opt-in, no managers) created a space where people share resources and check in on each other. We are not therapists, but having peers who understand makes a real difference.',
  ],

  'identity_belonging': [
    'Being the only Black person on my team means every mistake I make feels like it represents my entire race. That pressure is invisible to my colleagues but ever-present for me. Finding community outside work has been essential for my mental health.',
    'Code-switching between my authentic self and my "work self" is exhausting. I speak differently, joke differently, even eat differently at work to avoid being stereotyped. The energy it takes is a tax my white colleagues never pay.',
    'Coming out as queer at work was terrifying. My manager was supportive, but some colleagues became noticeably distant. The company inclusive policies did not translate to inclusive people. Policies are necessary but not sufficient.',
    'As a trans person, navigating bathroom politics at work should not be something I have to think about. When my company installed all-gender restrooms, it was such a small change that meant the world. Inclusion is often in the details.',
    'My accent has been the subject of comments my entire career. "Where are you really from?" is not small talk -- it is othering. I have started responding with "I am from [city where I live]" and letting the awkward silence do its work.',
    'Being an immigrant in tech means constantly proving you belong while navigating visa anxiety. Every performance review carries extra weight because your ability to stay in the country depends on it. The stress is overwhelming.',
    'I wear hijab and the stares in tech offices are constant. One colleague asked if I was "allowed" to code. Rather than educate everyone individually, I now present at company all-hands about the intersection of faith and tech. Visibility is power.',
    'Finding other people who share my identity at work changed everything. We do not even talk about work -- just knowing there are others who understand my experience without explanation is profoundly comforting. Seek out your people.',
    'Authenticity at work is a privilege not everyone can afford. Before you tell someone to "just be yourself," consider whether the environment actually makes that safe. For many of us, it does not.',
  ],

  'workplace_dynamics': [
    'My manager takes credit for my work in every leadership meeting. I started CC-ing skip-level leadership on key updates and presenting my own work in cross-team forums. Make your contributions visible beyond your direct manager.',
    'Toxic team culture does not change without intervention. We were losing a person every quarter until someone finally escalated to HR with data. Exit interview patterns, engagement survey results, and documented incidents created an undeniable case.',
    'The gossip culture at my workplace is corrosive. I made a personal rule: if I would not say it to someone face, I do not say it at all. It has cost me some social capital, but it has earned me trust from the people who matter.',
    'Having a toxic manager taught me more about leadership than any course. I learned exactly what NOT to do, and I carry those anti-patterns as cautionary tales now that I manage my own team.',
    'Team culture is set by what leaders tolerate. When my director laughed off a sexist joke in a meeting, it told everyone exactly where the boundary was. I pushed back publicly and it was uncomfortable, but the jokes stopped.',
    'Navigating office politics as someone who hates politics was my biggest career challenge. I learned that "not playing the game" is itself a strategy -- and usually a losing one. Understanding power dynamics is not being fake; it is being strategic.',
    'My team implemented a "no interruptions" rule in meetings using a talking stick (metaphorical, via Zoom reactions). It completely transformed our dynamics. The quieter team members finally had space to contribute.',
    'I discovered my manager was actively blocking my transfer to another team because I was "too valuable" to lose. When I escalated to their manager, the transfer went through in a week. Advocate for yourself -- no one else will.',
    'Building trust with a new team as an outsider takes deliberate effort. I scheduled 30-minute 1:1s with every team member in my first two weeks, listened more than I talked, and made my first contribution a small, helpful thing.',
  ],

  'job_search_salary': [
    'After being laid off, I treated the job search like a job: 9-5, structured schedule, specific targets. I applied to 147 positions, got 12 phone screens, 5 onsites, and 2 offers. It is a numbers game, but a strategic one.',
    'Salary negotiation tip that worked: when they gave me the offer, I said "I am excited about this role. Based on my research and competing interests, I was targeting a higher range. Is there flexibility?" They came up 15%. The ask cost me nothing.',
    'Recruiters who ask for your current salary are trying to anchor low. In states where it is legal to ask, I still redirect: "I am targeting a range based on the role responsibilities and market data." Do not anchor yourself.',
    'The job interview process is broken. Eight rounds over six weeks, then ghosted. I now ask for the full interview process upfront and decline if it is more than four rounds. My time has value too.',
    'Being laid off felt like a personal failure until I realized 100,000 other people were laid off the same month. It is an economic event, not a performance evaluation. Separating my self-worth from my employment status was crucial.',
    'I negotiated a job offer from $140K to $175K by having a competing offer at $165K. The competing offer was from a company I did not even want to work for, but it served its purpose as leverage. Always have options.',
    'Recruiter ghosting after multiple interview rounds should be illegal. I now ask recruiters to commit to a timeline and a guaranteed response date. It does not always work, but it sets expectations.',
    'Layoff survivor guilt is real. Watching my colleagues get let go while I kept my job felt terrible. I actively helped displaced teammates with referrals, resume reviews, and mock interviews. Supporting each other is how we get through this.',
    'The hidden job market is real -- I got my current role through a former colleague referral before it was ever posted publicly. Maintain your network even when you are happily employed. Especially when you are happily employed.',
  ],

  'celebration': [
    'Reading your wins gives me so much hope. This community reminds me that good things do happen, especially for people who have been told they cannot. Congratulations -- you earned every bit of this!',
    'Your success is proof that persistence pays off. I have been in a dark place career-wise, and seeing posts like yours reminds me to keep going. Thank you for sharing and inspiring the rest of us.',
    'This made my entire day! The fact that you did this while navigating all the additional challenges our community faces makes it even more impressive. You are not just succeeding -- you are breaking barriers.',
    'Congratulations! I love that you are celebrating publicly. So many of us were taught to be humble about our wins, but visibility matters. When you win, we all win. Keep shining.',
    'The joy in this post is contagious! You deserve to celebrate loudly and proudly. For everyone reading this who is still grinding -- this is what is possible. Do not give up.',
    'I literally teared up reading this. I have been where you were six months ago and knowing someone made it through gives me strength. Your dream job is just the beginning -- the best is yet to come.',
    'What an incredible achievement! And the fact that you are sharing it here, in this community, means the world. Representation in success stories matters just as much as representation in leadership.',
    'This is the energy I come to this space for! Celebrate every win, big and small. You fought for this, you prepared for this, and you deserve this. Sending you all the good vibes!',
    'Your journey to this moment is just as inspiring as the destination. Thank you for being transparent about the struggles along the way -- it makes the victory even sweeter. Congratulations!',
  ],

  'default_general': [
    'Thank you for sharing this. It takes courage to be vulnerable, especially in a space where so many of us have been conditioned to appear strong at all times. You are not alone in this.',
    'I have been through something very similar and I want you to know: it gets better. Not overnight, and not without effort, but it genuinely does get better. Lean on this community whenever you need to.',
    'This resonates with me deeply. I have been carrying something similar and reading your words made me feel less isolated. Sometimes just knowing someone else understands is enough to keep going.',
    'Sending you so much support. You do not have to have it all figured out right now. Progress is not linear and setbacks are not failures. Take it one day at a time and give yourself grace.',
    'I hear you, and your feelings are completely valid. Do not let anyone -- colleagues, managers, or inner critic -- tell you otherwise. Trust your instincts about what you are experiencing.',
    'This community is here for you. No judgment, no unsolicited advice -- just support. If you need to vent, vent. If you need strategies, ask. If you just need to be heard, we are listening.',
    'What you are going through is harder than people realize. The intersection of professional challenges and personal identity creates a weight that is invisible to most. But it is visible here. We see you.',
    'I wish I had advice but honestly I am just here to say: same. Knowing I am not the only one navigating this gives me comfort, and I hope it does the same for you. We are in this together.',
    'Your honesty is a gift to this community. Every time someone speaks their truth, it makes it safer for the next person. Thank you for being brave enough to go first.',
  ],
};

// --- Feed comment pools (8+ per theme) ---------------------------------------

const FEED_COMMENT_POOLS: Record<string, string[]> = {
  mentoring: [
    'Mentoring is one of the most impactful things you can do for someone career. Thank you for investing your time in others -- it creates ripple effects that last for years.',
    'I remember when my mentor first believed in me before I believed in myself. That single relationship changed the trajectory of my entire career. Keep pouring into your mentees!',
    'The best mentoring relationships are reciprocal. I learn as much from my mentees as they learn from me -- fresh perspectives, new technologies, and different lived experiences.',
    'Representation in mentoring matters so much. Having a mentor who understands the specific challenges of navigating your industry as a person of color is invaluable. Thank you for being that person.',
    'I always tell my mentees: do not just seek mentors who look like you, but also find sponsors who have power in the spaces where decisions about your career are made.',
    'Your mentoring work is building the pipeline that companies claim does not exist. Every mentee you support is proof that talent is everywhere -- opportunity is not.',
    'Mentoring sessions like these are what make our community strong. Knowledge sharing, honest feedback, and genuine investment in someone growth -- this is how we lift each other up.',
    'I signed up to be a mentor here and it has been one of the most rewarding experiences of my career. Seeing someone apply advice and then come back with a win is incredible.',
    'The mentoring culture in this community is special. In most workplaces, you are on your own. Here, people genuinely want to see each other succeed. That is rare and precious.',
  ],

  career_advice: [
    'This is exactly the kind of practical career guidance that is often gatekept in professional circles. Thank you for sharing it openly -- someone needed to hear this today.',
    'Career development advice hits differently when it comes from someone who has navigated the same systemic barriers. Generic advice does not account for the realities many of us face.',
    'I wish I had heard this five years ago. It would have saved me from accepting roles that were stepping stones to nowhere. Better late than never -- applying this immediately.',
    'The best career advice acknowledges that "just work hard and you will be recognized" does not work equally for everyone. Strategic visibility and self-advocacy are survival skills, not optional extras.',
    'This kind of honest career talk is why I come to this platform. No corporate fluff, no toxic positivity -- just real people sharing real strategies that actually work.',
    'Your point about career growth resonates with me. I have been heads-down executing for years and wondering why I am not advancing. It is time to start being strategic about my visibility and next moves.',
    'Thank you for breaking down the unwritten rules of career advancement. These are the things that privileged insiders know from day one but the rest of us have to figure out through trial and error.',
    'Saving this post. The career advice here is more valuable than any corporate training I have attended. Real experiences from real people navigating the same challenges I face.',
    'This reminds me that career growth is not just about skills -- it is about relationships, timing, and positioning. You have given me a lot to think about for my next move.',
  ],

  dei_culture: [
    'DEI work is exhausting when it falls disproportionately on the people it is supposed to help. Thank you for raising this -- companies need to invest real resources, not just rely on volunteer labor from underrepresented employees.',
    'Inclusion is not a program -- it is a culture. And culture change requires leadership commitment, structural reform, and accountability. Posts like this remind me why I keep pushing for better.',
    'The intersectionality point here is crucial. DEI programs that treat diversity as a single axis miss the compounding challenges that people with multiple marginalized identities face daily.',
    'Your perspective on workplace culture is so important. The "bring your whole self to work" messaging rings hollow when the environment punishes authenticity. Real inclusion requires real safety.',
    'This is why spaces like AffinityEcho matter. Corporate DEI programs come and go with budget cycles, but community-driven support is resilient and genuine.',
    'Reading about your experience with workplace equity challenges reminds me how much work remains. But it also reminds me that we are not alone -- and collective voice is powerful.',
    'Thank you for speaking up about this. DEI is not just about hiring numbers -- it is about creating environments where every person can thrive, be heard, and advance equitably.',
    'Equity and inclusion take continuous effort, not annual training checkboxes. Your post is a powerful reminder that the work is never "done" -- it is an ongoing commitment.',
    'The cultural dynamics you are describing are exactly why representation at every level matters. When decision-makers do not reflect the workforce, the policies they create will always have blind spots.',
  ],

  personal_growth: [
    'Your vulnerability in sharing this is inspiring. Growth happens outside our comfort zones, and the fact that you are leaning into that discomfort shows real courage.',
    'Personal growth and professional growth are deeply intertwined, especially for those of us who have had to overcome systemic barriers. Every step forward on one front reinforces the other.',
    'Confidence is not the absence of fear -- it is acting despite it. Your willingness to share your journey publicly is itself an act of confidence that will inspire others.',
    'I love seeing this kind of growth mindset in our community. Learning to bet on yourself after years of being underestimated is revolutionary. Keep going!',
    'The self-awareness in this post is impressive. Recognizing your own patterns, challenging your inner critic, and choosing to grow -- that is the hardest work there is, and you are doing it.',
    'Thank you for normalizing the messy, non-linear nature of personal growth. Social media shows the highlight reel; you are showing the real process. That is much more helpful and honest.',
    'Your growth journey resonates with mine. The moment I stopped waiting for external validation and started trusting my own judgment, everything shifted. You are clearly on that path.',
    'This is a beautiful reminder that growth is not just about acquiring skills -- it is about shedding the limiting beliefs that were never ours to begin with. Proud of you!',
    'Learning, unlearning, and relearning is the cycle of genuine growth. Your willingness to be open about that process creates space for others to do the same.',
  ],

  general: [
    'Love seeing this in my feed! The authenticity in this community is what keeps me coming back. Thank you for sharing your experience with us.',
    'This is the kind of content that makes AffinityEcho special. Real voices, real experiences, no corporate filter. Keep posting -- your perspective matters.',
    'Thank you for being part of this community and contributing your voice. Every post, every comment, every interaction strengthens the fabric of what we are building here.',
    'Great post! It is refreshing to see honest, unfiltered thoughts from someone who gets it. This community thrives because of people like you who show up authentically.',
    'I am constantly amazed by the quality of discussions here. This is not just social media -- it is a support system disguised as a platform. Grateful for spaces like this.',
    'Your post sparked some important reflection for me. That is the power of community -- we challenge and inspire each other simply by sharing our truths.',
    'Adding my voice to say: this resonates. Sometimes it is comforting just to know that others are thinking about and experiencing the same things. Solidarity.',
    'This is why I check this platform every day. The perspectives here are diverse, genuine, and thought-provoking. Thank you for contributing to that.',
    'Appreciate you sharing this! The more we talk openly about our experiences, the more we normalize the conversations that need to be had. Keep it coming.',
  ],
};

// --- Theme detection helpers -------------------------------------------------

function detectForumCategory(forumName: string): string {
  const name = forumName.toLowerCase();
  if (name.includes('diversity') || name.includes('inclusion')) return 'Diversity & Inclusion';
  if (name.includes('salary') || name.includes('negotiat')) return 'Salary & Negotiations';
  if (name.includes('mental health')) return 'Mental Health';
  if (name.includes('women')) return 'Women in Tech';
  if (name.includes('tech career') || (name.includes('career') && !name.includes('leadership'))) return 'Tech Careers';
  if (name.includes('leadership')) return 'Leadership Journeys';
  if (name.includes('interview')) return 'Interview Preparation';
  if (name.includes('work-life') || name.includes('balance')) return 'Work-Life Balance';
  if (name.includes('entrepreneur')) return 'Entrepreneurship';
  if (name.includes('industry') || name.includes('insight')) return 'Industry Insights';
  // fallback: try partial match on first word of each category
  for (const key of Object.keys(FORUM_COMMENT_POOLS)) {
    if (name.includes(key.toLowerCase().split(' ')[0])) return key;
  }
  return 'Tech Careers'; // default
}

function detectNookTheme(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('promotion') || t.includes('promoted') || t.includes('career') || t.includes('raise') || t.includes('advancement')) return 'promotion_career';
  if (t.includes('microaggression') || t.includes('bias') || t.includes('diversity hire') || t.includes('discrimination') || t.includes('dei') || t.includes('racist') || t.includes('retaliation')) return 'bias_discrimination';
  if (t.includes('burnout') || t.includes('mental health') || t.includes('anxiety') || t.includes('panic') || t.includes('sunday scaries') || t.includes('exhaustion')) return 'burnout_mental_health';
  if (t.includes('only one') || t.includes('belong') || t.includes('code-switching') || t.includes('authentic') || t.includes('identity') || t.includes('queer') || t.includes('trans') || t.includes('religious') || t.includes('accent') || t.includes('immigrant')) return 'identity_belonging';
  if (t.includes('manager') || t.includes('toxic') || t.includes('credit') || t.includes('team') || t.includes('culture') || t.includes('gossip')) return 'workplace_dynamics';
  if (t.includes('salary') || t.includes('negotiat') || t.includes('job offer') || t.includes('interview') || t.includes('recruiter') || t.includes('layoff')) return 'job_search_salary';
  if (t.includes('celebrating') || t.includes('dream job')) return 'celebration';
  return 'default_general';
}

function detectFeedTheme(content: string): string {
  const c = content.toLowerCase();
  if (c.includes('mentor') || c.includes('mentee') || c.includes('mentoring')) return 'mentoring';
  if (c.includes('career') || c.includes('growth') || c.includes('development') || c.includes('advice')) return 'career_advice';
  if (c.includes('diversity') || c.includes('inclusion') || c.includes('equity') || c.includes('dei') || c.includes('culture')) return 'dei_culture';
  if (c.includes('confidence') || c.includes('learning') || c.includes('vulnerability') || c.includes('personal') || c.includes('journey') || c.includes('proud')) return 'personal_growth';
  return 'general';
}

// --- Main --------------------------------------------------------------------

async function main() {
  console.log('=== fix-seed-comments.ts ===');
  console.log('Connecting to database...');

  // Step 1: Query existing data
  console.log('\n--- Step 1: Querying existing data ---');

  const users = await sql`SELECT id FROM user_profiles ORDER BY created_at`;
  console.log(`  Found ${users.length} users`);
  if (users.length === 0) {
    console.error('ERROR: No users found. Run seed.fake.ts first.');
    await sql.end();
    process.exit(1);
  }

  const topics = await sql`
    SELECT ft.id, ft.title, ft.content, f.name as forum_name, ft.created_at
    FROM forum_topics ft JOIN forums f ON f.id = ft.forum_id
    WHERE f.is_global = true ORDER BY ft.created_at
  `;
  console.log(`  Found ${topics.length} forum topics`);

  const nooks = await sql`
    SELECT id, title, description, created_at FROM nooks ORDER BY created_at
  `;
  console.log(`  Found ${nooks.length} nooks`);

  const feedPosts = await sql`
    SELECT id, content, created_at FROM feed_posts ORDER BY created_at
  `;
  console.log(`  Found ${feedPosts.length} feed posts`);

  // Step 2: Delete existing data
  console.log('\n--- Step 2: Deleting existing data ---');

  const deletedForumComments = await sql`DELETE FROM forum_comments`;
  console.log(`  Deleted forum_comments (${deletedForumComments.count} rows)`);

  const deletedNookMessages = await sql`DELETE FROM nook_messages`;
  console.log(`  Deleted nook_messages (${deletedNookMessages.count} rows)`);

  const deletedFeedComments = await sql`DELETE FROM feed_comments`;
  console.log(`  Deleted feed_comments (${deletedFeedComments.count} rows)`);

  // Step 3: Insert forum comments
  console.log('\n--- Step 3: Inserting forum comments ---');
  let forumCommentCount = 0;
  let userIdx = 0;

  for (const topic of topics) {
    const category = detectForumCategory(topic.forum_name);
    const pool = FORUM_COMMENT_POOLS[category] || FORUM_COMMENT_POOLS['Tech Careers'];
    const commentCount = randomInt(3, 5);
    const selectedComments = pickRandom(pool, commentCount);

    for (let i = 0; i < selectedComments.length; i++) {
      const userId = users[userIdx % users.length].id;
      userIdx++;
      const createdAt = offsetMinutes(new Date(topic.created_at), 10 + i * 30, 60 + i * 60);

      await sql`
        INSERT INTO forum_comments (id, topic_id, user_id, content, is_anonymous, created_at, updated_at)
        VALUES (gen_random_uuid(), ${topic.id}, ${userId}, ${selectedComments[i]}, true, ${createdAt}, ${createdAt})
      `;
      forumCommentCount++;
    }
  }
  console.log(`  Inserted ${forumCommentCount} forum comments`);

  // Step 4: Insert nook messages
  console.log('\n--- Step 4: Inserting nook messages ---');
  let nookMessageCount = 0;

  for (const nook of nooks) {
    const theme = detectNookTheme(nook.title);
    const pool = NOOK_MESSAGE_POOLS[theme] || NOOK_MESSAGE_POOLS['default_general'];
    const messageCount = randomInt(4, 7);
    const selectedMessages = pickRandom(pool, messageCount);

    for (let i = 0; i < selectedMessages.length; i++) {
      const userId = users[userIdx % users.length].id;
      userIdx++;
      const createdAt = offsetMinutes(new Date(nook.created_at), 15 + i * 45, 90 + i * 90);

      await sql`
        INSERT INTO nook_messages (id, nook_id, user_id, content, is_anonymous, created_at, updated_at)
        VALUES (gen_random_uuid(), ${nook.id}, ${userId}, ${selectedMessages[i]}, true, ${createdAt}, ${createdAt})
      `;
      nookMessageCount++;
    }
  }
  console.log(`  Inserted ${nookMessageCount} nook messages`);

  // Step 5: Insert feed comments
  console.log('\n--- Step 5: Inserting feed comments ---');
  let feedCommentCount = 0;

  for (const post of feedPosts) {
    const theme = detectFeedTheme(post.content);
    const pool = FEED_COMMENT_POOLS[theme] || FEED_COMMENT_POOLS['general'];
    const commentCount = randomInt(2, 4);
    const selectedComments = pickRandom(pool, commentCount);

    for (let i = 0; i < selectedComments.length; i++) {
      const userId = users[userIdx % users.length].id;
      userIdx++;
      const createdAt = offsetMinutes(new Date(post.created_at), 5 + i * 20, 45 + i * 40);

      await sql`
        INSERT INTO feed_comments (id, user_id, content_type, content_id, content, is_anonymous, parent_comment_id, created_at, updated_at)
        VALUES (gen_random_uuid(), ${userId}, 'post', ${post.id}, ${selectedComments[i]}, false, NULL, ${createdAt}, ${createdAt})
      `;
      feedCommentCount++;
    }
  }
  console.log(`  Inserted ${feedCommentCount} feed comments`);

  // Step 6: Recalculate counts
  console.log('\n--- Step 6: Recalculating counts ---');

  await sql`
    UPDATE forum_topics ft
    SET comments_count = (SELECT count(*) FROM forum_comments fc WHERE fc.topic_id = ft.id)
  `;
  console.log('  Updated forum_topics.comments_count');

  await sql`
    UPDATE nooks n
    SET messages_count = (SELECT count(*) FROM nook_messages nm WHERE nm.nook_id = n.id)
  `;
  console.log('  Updated nooks.messages_count');

  await sql`
    UPDATE feed_posts fp
    SET comments_count = (SELECT count(*) FROM feed_comments fc WHERE fc.content_id = fp.id AND fc.content_type = 'post')
  `;
  console.log('  Updated feed_posts.comments_count');

  // Summary
  console.log('\n=== Summary ===');
  console.log(`  Forum comments inserted: ${forumCommentCount}`);
  console.log(`  Nook messages inserted:  ${nookMessageCount}`);
  console.log(`  Feed comments inserted:  ${feedCommentCount}`);
  console.log(`  Total users cycled:      ${userIdx}`);
  console.log('\nDone!');

  await sql.end();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await sql.end();
  process.exit(1);
});
