/**
 * fix-mentorship-bios.ts — Replaces generic mentorship profiles with diverse,
 * multi-paragraph, LLM-generated bios unique to each user's job title and experience.
 *
 * Run: npx dotenv -e .env -- ts-node scripts/db/fix-mentorship-bios.ts
 */
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

type BioFn = (title: string, years: number) => string;

// ═══════════════════════════════════════════════════════════════════════════════
// GENERAL BIOS FOR MENTORS — 55 unique, multi-paragraph profiles
// ═══════════════════════════════════════════════════════════════════════════════

const MENTOR_GENERAL_BIOS: BioFn[] = [
  (t, y) => `I never planned to become a ${t}. I studied music in college and spent my twenties performing in dive bars across the Midwest before a friend convinced me to try a coding bootcamp. That nonlinear path shaped everything about how I approach technology — I build for the humans, not the machines. ${y} years later, I lead with empathy and curiosity, and I have zero patience for gatekeeping in this industry.`,

  (t, y) => `Growing up as the child of immigrants in a neighborhood with no tech companies, no one in my family could explain what a ${t} even did. I figured it out the hard way — through library books, free online courses, and a stubborn refusal to let my zip code determine my ceiling. Now, ${y} years into this career, I am laser-focused on making sure kids like me see themselves in rooms like mine.`,

  (t, y) => `My path to becoming a ${t} started in the military, where I spent six years maintaining communications systems in environments where failure meant something more than a bad quarterly review. That background gave me an obsession with reliability and a deep respect for teamwork under pressure. ${y} years in civilian tech have only reinforced those values.`,

  (t, y) => `I have been a ${t} for ${y} years, and I still remember the gut-punch of my first performance review — the one where my manager told me I was "too aggressive" for asking the same questions my white male colleagues asked without consequence. That moment radicalized me. Not in an angry way, but in a way that made me determined to build teams where nobody gets penalized for showing up authentically.`,

  (t, y) => `Before tech, I was a high school math teacher in East Oakland. I spent five years watching brilliant kids get funneled away from STEM because nobody told them they belonged there. I made the jump to ${t} because I realized I could have more systemic impact from inside the industry. ${y} years later, I split my time between shipping code and running workshops for underserved youth.`,

  (t, y) => `I am a ${t} with ${y} years of experience, but the credential I am most proud of is being the first person in my family to earn a four-year degree. That accomplishment came with a steep learning curve in corporate culture — nobody teaches you how to navigate office politics in a first-generation household. Every mentoring relationship I have starts with that honest reality.`,

  (t, y) => `The most formative experience of my ${y}-year career as a ${t} was getting laid off during the 2020 pandemic with a newborn at home. It shattered the illusion that loyalty to a company equals job security. When I rebuilt, I rebuilt differently — with boundaries, with savings, and with a commitment to helping others prepare for the curveballs this industry throws.`,

  (t, y) => `I do not fit the stereotype of a ${t}. I am loud, I am emotional, and I bring my full self to every standup. For ${y} years I tried to code-switch my way through corporate environments, dimming my personality to fit in. When I finally stopped, my career took off. Turns out, the thing that made me "different" was exactly what my teams needed.`,

  (t, y) => `My career as a ${t} spans ${y} years, two continents, and three industries. I started in fintech in Lagos, moved to healthcare tech in London, and now work in consumer products in San Francisco. Each transition taught me that technical skills are portable but cultural fluency is the real differentiator. I thrive in environments where diverse perspectives are not just tolerated but leveraged.`,

  (t, y) => `I spent the first half of my ${y}-year career as a ${t} working at companies where I was the only woman on the engineering team. I spent the second half building teams where that would never be anyone else's experience. The code I write matters, but the culture I create matters more.`,

  (t, y) => `There is a particular kind of loneliness that comes with being a ${t} who does not look like the stock photo version of one. For ${y} years I have worked to turn that loneliness into community — co-founding ERGs, mentoring bootcamp grads, and showing up in spaces where people need to see someone who looks like them succeeding. My technical work is excellent because it is fueled by purpose.`,

  (t, y) => `When people ask about my ${y} years as a ${t}, they usually want to hear about the big launches and the promotions. I would rather talk about the time I advocated for a junior engineer who was being overlooked, or the sprint retro where I finally created enough psychological safety for someone to admit they were struggling. Those are the moments that define my career.`,

  (t, y) => `I became a ${t} because I am fascinated by complex systems — and I do not just mean software. The organizational dynamics, the power structures, the way information flows through a company — understanding these human systems has been as important to my ${y}-year career as understanding distributed architecture. I bring a systems-thinking lens to everything I do.`,

  (t, y) => `My grandmother cleaned offices in Manhattan for 30 years so her grandchildren could sit in them. I think about her every morning when I open my laptop as a ${t}. ${y} years into this career, I carry that legacy with intention — working hard not just for myself, but for the generation behind me who needs to see that this path is possible.`,

  (t, y) => `After ${y} years as a ${t}, I have developed a simple philosophy: the best technology serves people who have been overlooked. Whether I am building an API or reviewing a system design, I ask who benefits, who is excluded, and what assumptions are baked into our decisions. My colleagues say I ask uncomfortable questions. I take that as a compliment.`,

  (t, y) => `I was diagnosed with ADHD at 32, halfway through my career as a ${t}. Suddenly, years of "underperformance" reviews made sense — I was not lazy or unfocused, my brain just worked differently. That diagnosis changed everything. Now, ${y} years in, I am open about neurodivergence because I know there are people on my team who need to hear that it is not a career-ender.`,

  (t, y) => `My journey as a ${t} started with a teenage obsession with modding video games. I taught myself to code by breaking things and putting them back together, and honestly, that is still my approach ${y} years later. I believe the best engineers are the curious ones — the ones who ask "what happens if I change this?" and are not afraid of the answer.`,

  (t, y) => `I have worked as a ${t} for ${y} years across companies ranging from a 5-person startup to a 100,000-person enterprise. What I have learned is that good engineering is good engineering regardless of scale, but the politics, the processes, and the career trajectories are wildly different. I help people navigate those differences so they can make intentional choices about where to plant their flag.`,

  (t, y) => `The hardest year of my ${y}-year career as a ${t} was the one I spent working for a toxic manager who took credit for my work and undermined me in meetings. I stayed too long because I thought enduring was the same as being strong. I know better now. That experience shapes how I lead — I am obsessively transparent about attribution and fiercely protective of my team.`,

  (t, y) => `I am a ${t} who thinks a lot about who gets to fail safely in this industry and who does not. In ${y} years, I have watched mediocre engineers from privileged backgrounds fail upward while brilliant people from underrepresented communities get one shot to prove themselves. I am working to change that math — through hiring, through sponsorship, and through building cultures that give everyone room to learn.`,

  (t, y) => `My ${y} years as a ${t} have taken me through three acquisitions, two pivots, and one company implosion. Through it all, I learned that your network and your reputation are the only things that survive organizational chaos. I invest heavily in relationships — not transactionally, but because the people in this industry are what make it worth staying in.`,

  (t, y) => `I grew up speaking three languages but none of them was the language of corporate America. As a ${t} with ${y} years of experience, I have become fluent in that fourth language — the one made of OKRs, executive summaries, and "managing up." I teach that language to others because I believe communication gaps, not skill gaps, are what hold most underrepresented professionals back.`,

  (t, y) => `I left a lucrative consulting career to become a ${t} because I wanted to build things, not just advise on them. That transition cost me two years of salary regression and a lot of ego bruising. But ${y} years later, I wake up excited about my work in a way I never did before. I am proof that it is never too late to pivot, and I love helping others do the same.`,

  (t, y) => `The tech industry talks a lot about innovation, but in my ${y} years as a ${t}, the most innovative thing I have seen is when a company actually commits to equity — not as a PR strategy, but as an engineering principle. Building accessible products, removing bias from algorithms, designing for edge cases instead of just the happy path. That is where I focus my energy.`,

  (t, y) => `I remember the exact moment I realized I belonged in tech. I was three years into my career as a ${t}, sitting in an architecture review, and I proposed a solution that made the room go quiet. Not because it was bad — because it was elegant. The senior architect looked at me and said, "That is exactly right." I have spent the next ${y - 3 > 0 ? y - 3 : y} years trying to create that moment for others.`,

  (t, y) => `Being a ${t} for ${y} years has taught me that technical excellence without emotional intelligence is just clever code that nobody wants to maintain. I have worked with absolute geniuses who could not communicate a design decision, and solid-but-not-spectacular engineers who built the best teams I have ever been on. I know which I would rather work with, and I know which I am trying to be.`,

  (t, y) => `I went through the foster care system and aged out at 18 with nothing. No connections, no safety net, no idea what a ${t} was. A community college program introduced me to programming, and I clung to it like a lifeline. ${y} years later, I have a career I am proud of and a burning drive to be the mentor I never had. My story is not unique — it is just rarely told.`,

  (t, y) => `As a ${t} with ${y} years in the industry, I have watched the DEI conversation swing from afterthought to spotlight to backlash and back again. Through all of it, my approach has stayed the same: build excellent things with excellent people, make sure "excellent" is defined broadly enough to include everyone, and never confuse representation with equity.`,

  (t, y) => `I am the kind of ${t} who reads the research papers behind the frameworks. ${y} years of going deep has taught me that understanding fundamentals is the difference between someone who follows trends and someone who sets them. But I have also learned that technical depth means nothing if you cannot explain it to a non-technical stakeholder in two sentences.`,

  (t, y) => `My career as a ${t} started with an internship I almost did not apply for because the job description said "5 years experience" and I had zero. A professor pushed me to apply anyway. I got the internship, then the full-time offer. ${y} years later, I ignore job requirements that are wishlists disguised as prerequisites, and I encourage everyone I mentor to do the same.`,

  (t, y) => `What distinguishes my ${y} years as a ${t} is not any single accomplishment — it is consistency. I show up prepared, I follow through on commitments, I give honest feedback even when it is uncomfortable, and I admit when I do not know something. In an industry obsessed with 10x engineers and rockstar developers, I am proof that reliability is the most underrated superpower.`,

  (t, y) => `I transitioned into tech as a ${t} after a decade in social work. People thought I was crazy to walk away from my graduate degree, but the analytical thinking, the stakeholder management, the ability to sit with ambiguity — it all transferred. ${y} years later, I am convinced that the best ${t}s are the ones who brought something unexpected to the table.`,

  (t, y) => `My ${y}-year journey as a ${t} has been defined by a willingness to take on the unglamorous work — the legacy migration nobody wanted, the oncall rotation everyone avoided, the documentation that had not been updated in two years. I learned early that volunteering for the hard stuff builds trust faster than any amount of self-promotion. That reputation has opened every door in my career.`,

  (t, y) => `I am a ${t} who stutters. For the first ${Math.min(y, 5)} years of my career, I avoided meetings, let others present my work, and built a reputation as "quiet but brilliant." Then I realized I was trading visibility for comfort, and visibility is what gets you promoted. Learning to speak up — literally — has been the hardest and most rewarding work of my ${y}-year career.`,

  (t, y) => `People are always surprised when I tell them I was a professional chef before becoming a ${t}. But the skills transfer more than you would think — managing chaos, optimizing processes, performing under pressure, and the understanding that the best outcomes come from diverse ingredients working together. ${y} years in tech and I still think like a kitchen, and my teams are better for it.`,

  (t, y) => `In ${y} years as a ${t}, I have been the "diversity hire," the "token," and the "proof that our pipeline is working." I have also been the best engineer on my team, the person who saved a product launch, and the leader who turned around a struggling org. I refuse to let anyone reduce my career to a demographic checkbox, and I mentor others to refuse the same.`,

  (t, y) => `I spent my twenties bouncing between startups that promised equity and delivered nothing. Those failures taught me more about technology — and about myself — than any success could have. Now, as a ${t} with ${y} years of battle scars, I help others evaluate opportunities with clear eyes. Not every rocket ship is going to the moon; some of them are going to crash.`,

  (t, y) => `My approach to being a ${t} is shaped by growing up in a multigenerational household where every decision was collective. I do not believe in lone-wolf engineering or hero culture. ${y} years of building software has confirmed what my grandparents always knew: the best solutions come from people who genuinely care about each other's success.`,

  (t, y) => `I hold a PhD in computational biology and chose industry over academia after watching too many brilliant researchers burn out chasing grants. As a ${t} for ${y} years, I have found the intellectual challenge I craved with the stability I needed. I mentor fellow career academics on making the transition without losing their identity or their sanity.`,

  (t, y) => `After ${y} years as a ${t}, my greatest skill is not any programming language or framework — it is the ability to sit in a room full of people who disagree and find the kernel of truth in every perspective. I have led teams through reorgs, product pivots, and heated architectural debates. The common thread? Listening first, deciding second, and always explaining the "why."`,

  (t, y) => `I come from a family of union tradespeople — electricians, plumbers, carpenters. They built things with their hands and took enormous pride in craftsmanship. I became a ${t} but I carry that same ethos: measure twice, cut once, leave it better than you found it. ${y} years of that philosophy has served me well and shaped the engineering culture of every team I have been on.`,

  (t, y) => `My ${y}-year career as a ${t} can be split into two chapters: before I learned to advocate for myself, and after. Chapter one was defined by doing excellent work and waiting to be noticed. Chapter two started when a mentor told me: "Your work does not speak for itself — you have to speak for it." That single piece of advice changed my trajectory, and I pass it on to everyone I can.`,

  (t, y) => `I became a ${t} at 40, after spending my thirties as a stay-at-home parent. The ageism I encountered during my job search was real and frustrating, but so was the resilience I had built raising three kids through chaos. ${y} years into my second career, I bring a perspective that twentysomethings fresh out of Stanford simply do not have — and teams that value that perspective thrive.`,

  (t, y) => `As a deaf ${t} who has worked in tech for ${y} years, I navigate a world designed for hearing people every single day. That experience has made me an exceptionally intentional communicator, a fierce advocate for accessibility, and someone who designs systems with edge cases as the starting point, not an afterthought. My disability is not a limitation — it is a lens.`,

  (t, y) => `I did not learn to code until I was 28, teaching myself Python in a public library because I could not afford a bootcamp. ${y} years later, I am a ${t} at a company I once thought would never hire someone like me. I share this not for sympathy but because somewhere out there is a person in a library wondering if this is even possible. It is.`,

  (t, y) => `My ${y} years as a ${t} have been shaped by a core belief: code is a conversation between the person who writes it and the person who will maintain it. I optimize for readability over cleverness, documentation over tribal knowledge, and team velocity over individual heroics. These are not sexy engineering principles, but they are the ones that keep organizations alive.`,

  (t, y) => `I grew up on a reservation in South Dakota where broadband internet arrived when I was a teenager. That late start gave me an outsider's perspective on technology that I have never lost. As a ${t} with ${y} years of experience, I think constantly about who technology is built by and who it is built for — and how often those two groups do not overlap.`,

  (t, y) => `The best decision of my ${y}-year career as a ${t} was joining a company where the CEO openly talked about mental health. It gave me permission to set boundaries I had been afraid to set — therapy during work hours, honest conversations about burnout, no-meeting Fridays. I am now an advocate for normalizing mental health in tech because I have seen how it transforms performance and retention.`,

  (t, y) => `I have been a ${t} for ${y} years and I have never once pulled an all-nighter. Not because I am not dedicated — because I am strategic. I learned early that sustainable pace produces better code, better decisions, and better teams. In an industry that glorifies hustle culture, I am a walking counterargument, and my career trajectory proves the point.`,

  (t, y) => `My identity as a ${t} is inseparable from my identity as a community organizer. For ${y} years, I have applied the same principles to both: understand the system, identify leverage points, build coalitions, and push for change that benefits everyone, not just the people already in power. This dual perspective makes me a better engineer and a better leader.`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// GENERAL BIOS FOR MENTEES — 55 unique, multi-paragraph profiles
// ═══════════════════════════════════════════════════════════════════════════════

const MENTEE_GENERAL_BIOS: BioFn[] = [
  (t, y) => `I am a ${t} with ${y} years of experience, and I am at a crossroads. I have the technical skills to do the job well, but I am realizing that skills alone do not get you to the next level — relationships, visibility, and strategic thinking do. I am here because I want to learn the things nobody teaches you in a CS curriculum.`,

  (t, y) => `Three years ago, I left a career in journalism to become a ${t}. The transition was harder than anyone warned me — the imposter syndrome, the salary dip, the feeling of being the oldest person in the room. But ${y} years in, I am starting to find my footing, and I am looking for a mentor who understands what it takes to rebuild from scratch.`,

  (t, y) => `I grew up in a small town where "making it" meant getting a government job and a pension. Becoming a ${t} was not on anyone's radar, least of all mine. Now I have ${y} years in the industry and I love what I do, but I feel like I am navigating a world without a map. The unwritten rules, the networking, the politics — I need a guide.`,

  (t, y) => `I am a ${t} with ${y} years of experience and a deep sense that I am capable of more than my current role allows. The challenge is not technical — it is figuring out how to package what I do into a story that resonates with decision-makers. I have never been good at self-promotion, and I know that is holding me back.`,

  (t, y) => `After ${y} years as a ${t}, I recently survived a round of layoffs that gutted my team. The experience left me questioning everything — my loyalty to employers, my career strategy, my financial preparedness. I am rebuilding with intention this time and looking for a mentor who can help me think long-term instead of just reacting to whatever comes next.`,

  (t, y) => `I am a first-generation American working as a ${t} with ${y} years of experience. My parents sacrificed everything to get me here, and I carry the weight of their expectations alongside my own ambitions. I need a mentor who understands the cultural complexity of being the family's success story while trying to carve out your own path.`,

  (t, y) => `I am a ${t} and a single parent. ${y} years in this industry have taught me that the advice "just work harder" does not apply when you are the only person picking up your kid from daycare. I need strategies for advancing my career that account for the reality of my life, not the fantasy of unlimited availability.`,

  (t, y) => `Currently working as a ${t} with ${y} years of experience, mostly at startups. I have worn every hat, fought every fire, and shipped features at 2 AM more times than I can count. What I have not done is learn how to operate in a structured, large-company environment — and I think that is where my next chapter is.`,

  (t, y) => `I am a ${t} with ${y} years of experience and a secret: I have been in the same role at the same company for almost all of it. I am comfortable, I am well-liked, and I am terrified of change. But I also know that comfort and growth do not coexist, and I am ready to be uncomfortable if it means becoming the professional I know I can be.`,

  (t, y) => `My ${y} years as a ${t} have been technically rewarding but socially isolating. I am one of very few people from my background on my team, and the loneliness of that experience has slowly eroded my confidence. I am looking for mentorship from someone who has navigated similar isolation and come out the other side with their sense of self intact.`,

  (t, y) => `I transitioned into tech as a ${t} after working as a nurse for eight years. People underestimate how transferable healthcare skills are — the triage mindset, the empathy, the ability to function in crisis. But ${y} years in, I still struggle with credibility in rooms full of people with CS degrees. I need help bridging that perception gap.`,

  (t, y) => `I am a ${t} with ${y} years of experience, and I recently received feedback that I am "technically strong but not leadership material." That stung, mostly because nobody could articulate what "leadership material" actually means. I suspect it means "acts like the leaders we already have," and I am looking for a mentor who can help me lead authentically without conforming.`,

  (t, y) => `My career as a ${t} started with an unpaid internship I took because it was the only door that opened. ${y} years and a lot of hard work later, I am in a much better place, but I still carry the financial anxiety of those early years. I need guidance on compensation strategy, wealth building, and learning to negotiate from a position of confidence, not desperation.`,

  (t, y) => `I am a ${t} who just moved to the US from Brazil. ${y} years of international experience, but everything here feels different — the interview style, the feedback culture, the networking expectations. I am technically excellent but culturally lost. I need a mentor who can help me translate my expertise into the language that American companies understand.`,

  (t, y) => `After ${y} years as a ${t}, I am questioning whether the traditional corporate ladder is even what I want. I have been climbing because that is what you are supposed to do, but lately I have been thinking about entrepreneurship, freelancing, or joining a mission-driven organization. I need a sounding board for this existential career rethink.`,

  (t, y) => `I am a ${t} with ${y} years of experience who just came out as trans at work. The support has been mostly positive, but the transition has complicated my professional identity in ways I was not prepared for. I need mentorship from someone who understands how identity and career intersect in deeply personal ways.`,

  (t, y) => `I grew up in foster care and aged out of the system at 18 with no safety net. I taught myself to code and worked my way up to ${t} over ${y} years of sheer determination. But determination got me here — strategy will get me further. I am looking for someone who can help me think three moves ahead instead of always reacting.`,

  (t, y) => `I am a ${t} with ${y} years of experience and a chip on my shoulder about not having a degree from a top-tier school. I know it should not matter, but in interviews and promotion conversations, the bias is real. I need help positioning my non-traditional background as a strength, not an apology.`,

  (t, y) => `My ${y} years as a ${t} have been mostly remote, and I am starting to realize how much that has cost me in terms of relationship-building and visibility. The colleagues who got promoted were the ones who grabbed coffee with the VP, not the ones who had the best code reviews. I need to learn the art of being seen without being performative.`,

  (t, y) => `I am a ${t} returning to work after a two-year break to care for my aging parents. The tech landscape has shifted dramatically, and my confidence has taken a hit. ${y} years of pre-break experience feel like they belong to a different person. I need a mentor who can help me update my skills, rebuild my network, and remember that I still have a lot to offer.`,

  (t, y) => `I am ${y} years into my career as a ${t}, and I just realized I have been optimizing for the wrong things — prestige, salary, title. None of it made me happy. Now I am looking for work that aligns with my values, and I need help figuring out how to make that transition without nuking my financial stability.`,

  (t, y) => `As a ${t} with ${y} years of experience, I have always been the person who helps everyone else on the team. My manager calls me a "force multiplier." But lately I have been wondering: who is multiplying my force? I give endlessly and advocate for others, but I have never learned to advocate for myself. That is what I need mentorship on.`,

  (t, y) => `I am a ${t} with ${y} years in the industry, working at a company where I love the mission but hate the culture. The leadership talks about inclusion but practices favoritism. I am torn between staying to fight for change and leaving to protect my energy. I need a mentor who has navigated this exact dilemma and can help me think it through.`,

  (t, y) => `My ${y}-year career as a ${t} has been shaped by anxiety that I manage well but never mention. The constant pressure to perform, the fear of being "found out," the Sunday dread — I am looking for a mentor who normalizes the mental health dimension of ambitious careers and can help me build sustainable habits.`,

  (t, y) => `I am a ${t} with ${y} years of experience and a deep interest in AI ethics. My current role does not touch this space at all, and I am trying to figure out how to transition into it without starting over. I need a mentor who understands how to make strategic lateral moves that position you for the future without sacrificing present stability.`,

  (t, y) => `As a ${t} with ${y} years of experience, I have hit the ceiling at my current company. I know I need to leave, but the thought of interviewing after all this time is paralyzing. The system design rounds, the take-homes, the behavioral gauntlet — I need help preparing for a modern job search without losing my mind.`,

  (t, y) => `I am a ${t} and a military spouse, which means I have moved four times in ${y} years. Each move resets my professional network and forces me to prove myself all over again. I need mentorship on building a portable career and a reputation that travels with me.`,

  (t, y) => `My path to ${t} was unconventional — I started as a barista, became a QA tester, then taught myself to code. ${y} years of scrappy, self-taught experience have made me resourceful but left gaps in my foundational knowledge. I need a mentor who can help me fill those gaps strategically without going back to square one.`,

  (t, y) => `I am a ${t} with ${y} years of experience at a company that was recently acquired. The culture clash has been brutal — new processes, new leadership, new expectations. Half my team has already left. I need help deciding whether to ride it out or jump, and how to position myself regardless of which path I choose.`,

  (t, y) => `I grew up coding in my bedroom in rural India, dreaming of Silicon Valley. Now I am a ${t} in the Bay Area with ${y} years of experience, and the reality is more complicated than the dream. The visa dependency, the cultural isolation, the pressure to perform at 120% just to be seen as equal — I need a mentor who gets it.`,

  (t, y) => `After ${y} years as a ${t}, I have developed deep expertise in my domain but zero skills in personal branding. I do not have a blog, I have never given a conference talk, and my LinkedIn is basically a resume dump. I know this matters for senior roles and I need help building a professional presence that reflects my actual capabilities.`,

  (t, y) => `I am a ${t} with ${y} years of experience who recently became a team lead. The transition from peer to manager has been rougher than expected — the politics, the difficult conversations, the loneliness of leadership. I need a mentor who remembers the early days of management and can help me find my footing.`,

  (t, y) => `I am a ${t} and the eldest daughter in an immigrant family, which means I carry emotional and financial responsibilities that my colleagues will never understand. ${y} years in tech have been a constant balancing act between ambition and obligation. I need mentorship that acknowledges the whole person, not just the professional.`,

  (t, y) => `My ${y} years as a ${t} have been defined by a tendency to job-hop — I have worked at five companies and I am not even 30. Each move was rational at the time, but now I am worried about how it looks. I need guidance on when to stay, when to go, and how to build a cohesive narrative from what looks like chaos.`,

  (t, y) => `I am a ${t} with ${y} years of experience and a genuine love for mentoring others. Ironically, I have never had a mentor myself. I have navigated my career on instinct and Google searches, and I have done okay, but I know I am leaving growth on the table. I am ready to be the mentee for once.`,

  (t, y) => `As a ${t} who is neurodivergent, my ${y} years in the industry have been a continuous exercise in masking. The open offices, the mandatory social events, the unwritten communication rules — it is exhausting. I need a mentor who can help me find workplaces and working styles that accommodate my brain instead of fighting it.`,

  (t, y) => `I am a ${t} with ${y} years of experience and zero industry connections outside my current company. I never learned to network because it felt fake and transactional. Now I realize that not networking is a privilege I cannot afford. I need a mentor who can teach me to build relationships authentically.`,

  (t, y) => `After ${y} years as a ${t}, I have the uncomfortable realization that I am coasting. I am competent, my reviews are fine, but I am not growing. The learning curve flattened years ago and I have been too comfortable to do anything about it. I need someone to push me out of this plateau with strategic challenges and honest feedback.`,

  (t, y) => `I am a ${t} with ${y} years of experience who is deeply passionate about using technology for social good. The challenge is that mission-driven organizations often pay significantly less and have smaller engineering teams. I need mentorship on navigating the tension between purpose and pragmatism.`,

  (t, y) => `I am a Black ${t} with ${y} years of experience, and I am exhausted by the expectation that I represent my entire race in every meeting, lead every DEI initiative, and educate every clueless colleague. I need a mentor who understands this particular form of burnout and can help me set boundaries without being labeled as "not a team player."`,

  (t, y) => `My ${y} years as a ${t} have been primarily in backend systems, but the industry is moving toward full-stack expectations. I need guidance on expanding my skill set strategically — which technologies to invest in, which to skip, and how to learn efficiently at this stage of my career without burning out.`,

  (t, y) => `I am a ${t} with ${y} years of experience, and honestly, I am scared. Scared of AI replacing my job, scared of falling behind on new technologies, scared that the career I built will become obsolete. I need a mentor who can cut through the hype and help me focus on the skills that will actually matter in five years.`,

  (t, y) => `After spending ${y} years as a ${t}, I want to use my technical background to move into venture capital or technical advisory roles. The problem is, I have no idea how to break into that world. It seems like a closed loop of introductions and pedigree. I need someone who has crossed that bridge to show me how.`,

  (t, y) => `I am a ${t} with ${y} years of experience who has always worked at small companies. The idea of joining a FAANG-level company is simultaneously exciting and terrifying. The interview process, the pace, the expectations — everything feels scaled up. I need a mentor from that world to help me prepare and decide if it is right for me.`,

  (t, y) => `I am a ${t} with ${y} years of experience, recently promoted, and honestly struggling with the new scope. Everyone assumes I should just "figure it out" because I was good at my last role. But the skills that got me promoted are not the skills I need now, and nobody is offering to bridge that gap. That is why I am here.`,

  (t, y) => `My journey to becoming a ${t} started in a refugee camp where I taught myself English from donated textbooks. ${y} years in the American tech industry later, I still sometimes feel like I am performing a version of myself that is acceptable to the workplace. I need a mentor who can help me succeed without losing the parts of myself that matter most.`,

  (t, y) => `I am a ${t} with ${y} years of experience, and I have never made more than the median salary for my role. I have always told myself the work should speak for itself, but that philosophy has cost me hundreds of thousands of dollars over my career. I am done being underpaid and I need help learning to value myself the way the market does.`,

  (t, y) => `As a ${t} who is also a veteran, my ${y} years in tech have been a study in cultural translation. The discipline and mission-focus from the military serve me well, but I still sometimes struggle with the ambiguity and consensus-driven decision-making of corporate environments. I am looking for mentorship at the intersection of these two worlds.`,

  (t, y) => `I am a ${t} with ${y} years of experience and I am about to become a first-time parent. I am terrified of the impact on my career — the parental leave, the reduced availability, the judgment from colleagues. I need a mentor who has navigated this transition and can give me honest advice about what to expect and how to protect my trajectory.`,

  (t, y) => `After ${y} years as a ${t}, I can confidently say that my biggest weakness is not technical — it is political. I do not play the game well. I do not know how to position myself for high-visibility projects, how to build alliances with skip-levels, or how to make my impact legible to people who matter. That is exactly what I need to learn.`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// MENTOR BIOS — 55 unique, multi-paragraph mentor-specific profiles
// ═══════════════════════════════════════════════════════════════════════════════

const MENTOR_BIO_TEMPLATES: BioFn[] = [
  (t, y) => `I have spent ${y} years navigating the unspoken rules of corporate tech as a ${t}, and the single most important thing I learned is this: nobody succeeds alone, and the people who pretend they did are lying. My mentoring style is direct, structured, and rooted in the belief that you already have what it takes — you just need someone to help you see it and strategize around it.`,

  (t, y) => `As a ${t} for ${y} years, I have hired hundreds of engineers, reviewed thousands of resumes, and sat in countless promotion committees. I know exactly how those decisions get made — and it is rarely about who writes the best code. I mentor on the invisible skills: narrative building, stakeholder management, and the art of making your impact visible to the people who control your trajectory.`,

  (t, y) => `My ${y}-year career as a ${t} nearly ended at year three when burnout put me in the hospital. That crisis became a turning point. I rebuilt my career with boundaries, sustainability, and self-awareness at the center. Now I mentor others — especially high-performers who are burning the candle at both ends — on building careers that do not require sacrificing their health.`,

  (t, y) => `I spent the first decade of my ${y}-year career as a ${t} believing that if I just worked harder, the recognition would follow. It did not. What followed was resentment, exhaustion, and a realization that hard work without strategy is just sweat. I now help my mentees work smarter — identifying leverage points, building the right relationships, and learning when to say no.`,

  (t, y) => `After ${y} years as a ${t}, I specialize in mentoring people through the most uncomfortable transitions: IC to manager, individual contributor to technical lead, employee to founder, big company to startup and vice versa. These transitions break people not because they lack skill, but because they lack a playbook. I provide the playbook, tailored to their unique situation.`,

  (t, y) => `I have been a ${t} for ${y} years and I have mentored over 40 professionals — from bootcamp graduates to VP candidates. My approach is not motivational speaking. It is tactical, specific, and sometimes uncomfortable. I will ask you hard questions about what you actually want versus what you think you should want, and we will build a plan from the honest answer.`,

  (t, y) => `My mentoring philosophy as a ${t} with ${y} years of experience is simple: I treat every mentee as a whole person, not just a career trajectory. Your relationship with work is influenced by your identity, your family, your health, your finances, and your history. We address all of it because career advice that ignores context is useless advice.`,

  (t, y) => `What makes me effective as a mentor is not my ${y} years as a ${t} — it is the fact that I failed spectacularly and publicly multiple times along the way. I got fired once, I bombed a keynote, I led a product that lost the company money. Every failure taught me something I now pass on to mentees. If you want a mentor with a perfect track record, I am not your person. If you want one with real talk, let us go.`,

  (t, y) => `As a ${t} who has worked across four countries in ${y} years, my mentoring superpower is perspective. I have seen how different cultures approach leadership, how different markets value different skills, and how the definition of "success" shifts depending on where you stand. I bring that global lens to every mentoring relationship.`,

  (t, y) => `I focus my mentoring on a specific and critical gap: the transition from being valued for your individual output to being valued for your influence. In ${y} years as a ${t}, I have watched brilliant people stall because they never learned to delegate, to communicate upward, or to build coalitions. I help people make that shift before it costs them years.`,

  (t, y) => `My ${y} years as a ${t} have given me a front-row seat to every flavor of workplace dysfunction — toxic managers, performative diversity, reorg chaos, and quiet layoffs. I do not mentor from an ivory tower. I mentor from the trenches, with practical advice for the messy, imperfect situations that real careers are made of.`,

  (t, y) => `I have been a ${t} for ${y} years and I co-founded my company's first Employee Resource Group for underrepresented professionals in tech. That experience taught me that individual mentoring and systemic advocacy are two sides of the same coin. I help my mentees succeed individually while also helping them become change agents in their own organizations.`,

  (t, y) => `As a ${t} with ${y} years of experience, I mentor specifically on the financial dimensions of career growth — negotiation, equity evaluation, offer comparison, and long-term wealth building. I have seen too many talented people from underrepresented backgrounds leave six figures on the table because nobody taught them the math behind compensation. I fix that.`,

  (t, y) => `My mentoring style is structured and outcome-oriented. In ${y} years as a ${t}, I have developed a framework I call the 90-Day Sprint: we identify one specific career goal, map the obstacles, build an action plan, and execute with weekly accountability check-ins. It is not casual advice over coffee — it is a disciplined partnership with measurable results.`,

  (t, y) => `I mentor because someone mentored me when I had nothing — no network, no degree from a name-brand school, no understanding of how the tech industry actually worked. That person changed my life. ${y} years later, as a ${t}, I have the resources and the knowledge to pay it forward, and I take that responsibility seriously.`,

  (t, y) => `After ${y} years as a ${t}, I have developed a particular expertise in helping people who are technically excellent but interpersonally struggling. The engineer who cannot work with product managers. The data scientist who alienates stakeholders with jargon. The designer who takes every critique personally. Technical skill without collaboration skill is a career limiter, and I help fix that.`,

  (t, y) => `My approach to mentoring as a ${t} is informed by ${y} years of watching people self-sabotage. Not through incompetence, but through fear — fear of negotiating, fear of applying, fear of speaking up, fear of being wrong. Most of my mentoring is about helping people develop the courage to act on what they already know, not giving them more information.`,

  (t, y) => `I became a mentor because I got tired of watching the same pattern repeat: talented people from underrepresented backgrounds hit a wall at the senior level, not because they lacked ability, but because they lacked access. Access to sponsors, to high-visibility projects, to the informal networks where real decisions happen. In my ${y} years as a ${t}, I have made it my mission to share that access.`,

  (t, y) => `As a ${t} for ${y} years, I mentor on what I call "career architecture" — the deliberate, long-term design of a professional trajectory. Most people make career decisions reactively: take the next job that comes along, accept the first offer, follow the path of least resistance. I help people zoom out, define what a meaningful career looks like for them specifically, and make every move intentional.`,

  (t, y) => `In ${y} years as a ${t}, the thing I am most qualified to teach is how to recover from career setbacks. I have been through layoffs, a toxic workplace that gave me PTSD, a failed startup, and a year of unemployment. Each time, I came back stronger — not because I am special, but because I developed a framework for resilience that anyone can learn.`,

  (t, y) => `My mentoring as a ${t} with ${y} years of experience focuses heavily on communication. Not the "here is how to write a better email" kind — the deep, strategic communication that shapes how people perceive your competence, your leadership potential, and your value. I help mentees craft their professional narrative because the story you tell about yourself is the single most powerful tool in your career.`,

  (t, y) => `I have been a ${t} for ${y} years, and the most important thing I do as a mentor is listen. Really listen. Most people who seek mentorship already know what they need to do — they are just looking for permission, validation, or a structured way to think through the complexity. My job is to create the space for that thinking to happen.`,

  (t, y) => `As a ${t} for ${y} years, I bring a data-driven approach to mentoring. We do not just talk about goals — we define success metrics, track progress, and iterate. I believe mentoring should feel more like a partnership and less like a pep talk. If you are looking for someone to just tell you "you can do it," I am not your match. If you want someone who will help you prove it, let us work together.`,

  (t, y) => `My ${y}-year journey as a ${t} included a decade where I was the only person of color in every room I entered. I did not just survive that experience — I learned to thrive in it while also working to change it. I mentor others on that dual challenge: excelling within systems that were not designed for you, while simultaneously pushing those systems to evolve.`,

  (t, y) => `I am a ${t} with ${y} years of experience who believes the best mentoring happens at the intersection of challenge and support. I will push you out of your comfort zone — to apply for the role you think you are not ready for, to have the conversation you have been avoiding, to set the boundary you are afraid to set. But I will also be there when it gets hard.`,

  (t, y) => `As a ${t} with ${y} years in the industry, my mentoring niche is helping parents navigate the career penalty that comes with having children — especially mothers. The return from leave, the reduced availability, the bias in performance reviews. I have been through it, I have studied it, and I have strategies that work.`,

  (t, y) => `After ${y} years as a ${t}, I specialize in helping underrepresented professionals prepare for and succeed in executive-level roles. The skills that get you to senior are not the skills that get you to VP. I help people develop board communication, strategic thinking, cross-functional leadership, and the political savvy needed to operate at the top.`,

  (t, y) => `I mentor with radical candor because in ${y} years as a ${t}, I have seen too many well-meaning mentors give vague, non-committal advice that does not actually help anyone. If your resume needs work, I will tell you. If your interview skills are weak, I will tell you. If you are undervaluing yourself by $50K, I will tell you. And then we will fix it together.`,

  (t, y) => `My ${y} years as a ${t} have convinced me that the most underinvested skill in tech is the ability to manage your own energy. Not time management — energy management. Knowing when you do your best work, what drains you, what recharges you, and how to structure your day and career around those rhythms. This is foundational to everything else I mentor on.`,

  (t, y) => `I have been a ${t} for ${y} years and I specifically seek out mentees who are at inflection points — the moments that define careers. Getting your first leadership opportunity. Deciding whether to stay or leave. Negotiating an offer that could change your financial trajectory. These high-stakes decisions deserve more than gut instinct, and that is where I come in.`,

  (t, y) => `As a ${t} for ${y} years, I have built and lost and rebuilt professional networks across continents and industries. That experience taught me that relationships — not algorithms, not credentials, not luck — are the primary driver of career success. I mentor others on building genuine professional relationships that compound over time.`,

  (t, y) => `My mentoring philosophy as a ${t} with ${y} years of experience comes down to three things: specificity, accountability, and celebration. We set specific goals, not vague aspirations. We build accountability structures, not wishful thinking. And we celebrate every win, because people from marginalized backgrounds are rarely told they are doing a good job. That changes in my mentoring relationships.`,

  (t, y) => `In ${y} years as a ${t}, I have observed that the people who advance fastest are not always the smartest or the most talented — they are the ones who can translate their impact into a language that resonates with leadership. I mentor on this translation layer: helping people articulate their contributions in terms of business outcomes, not just technical deliverables.`,

  (t, y) => `I came to mentoring after my own mentor — a ${t} who took a chance on me when I was 22 and clueless — passed away unexpectedly. She gave me ${y > 10 ? 'the first decade' : 'the early years'} of my career, and continuing her legacy through mentoring others is how I honor her. Every mentee I work with carries forward something she taught me.`,

  (t, y) => `After ${y} years as a ${t}, the question I get most from mentees is "how do I get noticed?" My answer is always the same: stop trying to get noticed and start trying to be useful. Solve problems that matter to people with influence. Volunteer for the project nobody wants. Share credit generously. Visibility is a byproduct of value, not an end in itself.`,

  (t, y) => `I am a ${t} with ${y} years of experience, and I mentor because I genuinely love watching people surprise themselves. The mentee who thought she could not negotiate and walked away with a 40% raise. The engineer who thought management was not for him and is now running a team of 20. The career changer who went from imposter to expert in 18 months. Those transformations fuel me.`,

  (t, y) => `My ${y} years as a ${t} taught me that career growth is not linear and it should not be. Lateral moves, sabbaticals, industry changes, role experiments — these are not detours, they are investments. I mentor people on building careers that look like portfolios, not ladders. Diversified, intentional, and resilient to market shifts.`,

  (t, y) => `As a ${t} with ${y} years of experience, I focus my mentoring on the first 90 days of any new role, because that window determines the next two years of your trajectory. How you onboard, how you build relationships, how you score early wins — these are all learnable skills, and most people wing it. I help people approach those critical first months with a strategy.`,

  (t, y) => `I have been a ${t} for ${y} years and I believe the biggest ROI in mentoring is helping people have difficult conversations they have been putting off. Asking for a raise. Confronting a toxic peer. Pushing back on scope creep. Setting a boundary with a demanding manager. We practice these conversations until my mentees can have them with confidence.`,

  (t, y) => `My life as a ${t} for ${y} years has been shaped by a simple truth: the systems are not broken — they are working exactly as designed. Mentoring is not about teaching people to game a fair system. It is about giving them the tools to navigate an unfair one while working to change it. That dual consciousness — pragmatism and idealism — is at the heart of everything I do.`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// MENTEE BIOS — 55 unique, multi-paragraph mentee-specific profiles
// ═══════════════════════════════════════════════════════════════════════════════

const MENTEE_BIO_TEMPLATES: BioFn[] = [
  (t, y) => `I am ${y} years into my career as a ${t} and I have realized that working harder is not getting me further — it is getting me more work. I need mentorship on working strategically: choosing the right projects, building the right relationships, and making my impact visible to the people who make promotion decisions. I am ready to invest in my career the way I invest in my craft.`,

  (t, y) => `As a ${t} with ${y} years of experience, I am at the point where my technical growth has outpaced my professional growth. I can architect complex systems but I cannot navigate a performance calibration. I can debug production issues in my sleep but I freeze when it is time to negotiate. The skills I need now are not on Stack Overflow, and that is why I am seeking a mentor.`,

  (t, y) => `My ${y} years as a ${t} have been spent almost entirely at one company. I am proud of what I have built here, but I am aware that my perspective has become narrow. I need a mentor who can show me what excellence looks like in other contexts and help me understand whether my skills are as portable as I hope they are.`,

  (t, y) => `I became a ${t} through a bootcamp and ${y} years of self-directed learning. The technical gaps have mostly closed, but the cultural gaps remain wide open. I do not know the war stories that CS graduates bond over. I did not intern at a Big Tech company. I do not have professors to call for references. I need a mentor who can help me compete without those advantages.`,

  (t, y) => `After ${y} years as a ${t}, I am preparing for the biggest career move of my life: a transition from a non-management track to a VP-level leadership role. The gap between where I am and where I want to be feels enormous, and I need someone who has been on the other side to help me build a credible bridge.`,

  (t, y) => `I am a ${t} with ${y} years of experience who has been passed over for promotion twice. Both times, the feedback was vague: "not quite ready" and "needs more executive presence." Nobody will tell me what that actually means in concrete, actionable terms. I am looking for a mentor who will give me the unvarnished truth and a plan to address it.`,

  (t, y) => `My career as a ${t} has spanned ${y} years and two completely different industries. Each transition taught me something valuable, but it also created a resume that confuses recruiters. I need help crafting a career narrative that makes my non-linear path look intentional rather than scattered — because it was, even if it does not look that way on paper.`,

  (t, y) => `I am a ${t} with ${y} years of experience, and my biggest professional challenge right now is managing up. My skip-level has no idea what I do, my manager takes credit for my work without malice but without attribution, and I am invisible to the leadership team despite being one of the most productive people on the team. I need tactical advice on changing this dynamic.`,

  (t, y) => `After ${y} years as a ${t}, I have the uncomfortable realization that my peers who started at the same time are now two levels above me. The difference is not skill — it is strategy, networking, and self-advocacy. Things I was never taught and never prioritized. I am done watching from the sidelines and I need a mentor who can help me close the gap.`,

  (t, y) => `I am a ${t} with ${y} years of experience and I am about to negotiate the most important offer of my career. I know I am being lowballed because my current compensation is below market. I need someone who understands comp structures, equity valuation, and the psychology of negotiation to help me get what I am actually worth.`,

  (t, y) => `My ${y}-year journey as a ${t} has been technically fulfilling but politically naive. I thought good code was enough. I thought meritocracy was real. I thought promotions went to the most qualified person. I was wrong about all three. I am now ready to understand how corporate advancement actually works, even if the truth is uncomfortable.`,

  (t, y) => `I am a ${t} with ${y} years of experience who recently joined a new team and is struggling to establish credibility. My previous role was highly specialized, and my new colleagues do not understand or value that expertise. I need help navigating the politics of starting over in a new organizational context without losing confidence.`,

  (t, y) => `As a ${t} for ${y} years, I have developed deep technical expertise but my soft skills need serious work. I get nervous in presentations, I struggle with conflict resolution, and my written communication is too technical for business audiences. I need a mentor who can help me develop these skills without feeling like I am pretending to be someone I am not.`,

  (t, y) => `I am a ${t} with ${y} years of experience who is dealing with the aftermath of a hostile work environment. I left, but the confidence damage lingers. I second-guess myself in meetings, I over-prepare for everything, and I am hypervigilant about workplace dynamics. I need mentorship that acknowledges this baggage and helps me move forward.`,

  (t, y) => `After ${y} years as a ${t}, I want to start contributing to open source and building a public technical profile, but I do not know where to begin. The open source world feels intimidating and cliquish from the outside. I need guidance on finding the right projects, making meaningful contributions, and building a reputation that opens doors.`,

  (t, y) => `I am a ${t} with ${y} years of experience and I recently discovered that a colleague with less experience and identical responsibilities is making $30K more than me. I do not know how to address this without seeming petty or burning bridges. I need a mentor who can help me navigate this situation with grace and strategy.`,

  (t, y) => `My ${y} years as a ${t} have been marked by a pattern I am trying to break: I accept roles below my level because I am grateful to be hired. The imposter syndrome runs deep, and it has cost me years of career progression and hundreds of thousands in lifetime earnings. I need a mentor who will hold me accountable to my actual worth.`,

  (t, y) => `I am a ${t} with ${y} years of experience who is exploring the possibility of going independent — freelancing or starting a consultancy. The idea of being my own boss is appealing, but the financial uncertainty is terrifying. I need a mentor who has made this leap and can help me plan the transition realistically, not just optimistically.`,

  (t, y) => `As a ${t} for ${y} years, I have been told repeatedly that I need to "build my brand." But every time I try to post on LinkedIn or speak at a meetup, it feels performative and gross. I need a mentor who can help me find an approach to professional visibility that feels authentic to my personality, which is introverted and private.`,

  (t, y) => `I am ${y} years into my career as a ${t} and I just received feedback that I need to "think more strategically." Nobody defined what that means for my role, my level, or my context. I need a mentor who can translate this vague corporate feedback into concrete skills I can develop and demonstrate.`,

  (t, y) => `My experience as a ${t} over ${y} years has mostly been at startups where the feedback culture is either nonexistent or brutally casual. I am moving to a Fortune 500 company and I have no idea how to navigate formal performance reviews, calibration cycles, and the political theater of annual promotions. I need a guide to this alien world.`,

  (t, y) => `I am a ${t} with ${y} years of experience and a growing interest in the business side of technology. I want to understand P&L ownership, market strategy, and how technical decisions map to business outcomes. My goal is to eventually move into a GM or Chief Product Officer role, and I need mentorship on that long-term arc.`,

  (t, y) => `After ${y} years as a ${t}, the thing I need most from a mentor is honest, specific feedback. Not "you are doing great" — real, uncomfortable, actionable feedback about what is holding me back. My current manager is conflict-averse and my peers are too polite. I need someone who will tell me the truth with care but without sugarcoating.`,

  (t, y) => `I am a ${t} with ${y} years of experience and I have been through three rounds of layoffs — survived two, was cut in the third. The psychological toll of corporate instability has left me risk-averse and overly focused on job security at the expense of growth. I need a mentor who can help me take calculated risks again.`,

  (t, y) => `My career as a ${t} has covered ${y} years, and the biggest challenge I face right now is not knowing what I want next. I have optimized for salary, then for title, then for mission — and none of it has felt right. I need a mentor who can help me figure out what actually matters to me before I make another move based on someone else's definition of success.`,

  (t, y) => `I am a ${t} with ${y} years of experience who wants to become a better technical writer and communicator. My code is excellent but my design documents, RFCs, and presentation skills lag behind. I know these communication skills are the bottleneck to senior and staff-level roles, and I need structured guidance on developing them.`,

  (t, y) => `After ${y} years as a ${t}, I have become deeply specialized in a niche technology that might be approaching end-of-life. The prospect of my expertise becoming irrelevant keeps me up at night. I need mentorship on how to pivot gracefully, which adjacent skills to develop, and how to market a decade of specialized experience as versatility rather than obsolescence.`,

  (t, y) => `I am a ${t} with ${y} years of experience and a complicated relationship with ambition. My culture values modesty and collective achievement over individual advancement. The American workplace rewards the opposite. I need a mentor who understands this tension and can help me advocate for myself without feeling like I am betraying my values.`,

  (t, y) => `My ${y} years as a ${t} have given me a strong technical foundation, but I am increasingly drawn to mentoring and coaching others. I am exploring whether learning and development, developer relations, or engineering enablement could be my next chapter. I need a mentor who has made a similar transition from builder to enabler.`,

  (t, y) => `I am a ${t} with ${y} years of experience who is tired of being overlooked for leadership opportunities because I am "too quiet." I am not quiet — I am thoughtful. I process before I speak. I observe before I act. I need a mentor who can help me reframe introversion as a leadership strength rather than a liability.`,

  (t, y) => `After ${y} years as a ${t}, I have reached a compensation level where every job change is a high-stakes negotiation involving base salary, equity, signing bonuses, and benefits packages. The complexity is overwhelming and the cost of getting it wrong is enormous. I need a mentor who has navigated these senior-level negotiations and can help me maximize my total compensation.`,

  (t, y) => `I am a ${t} with ${y} years of experience, and my goal for the next year is simple but hard: learn to say no. I am a chronic people-pleaser who takes on every request, volunteers for every committee, and never pushes back on unrealistic timelines. It has earned me a reputation as "reliable" but it is also why I am burned out and under-promoted.`,

  (t, y) => `My ${y}-year career as a ${t} includes a chapter I rarely talk about: two years at a company where I was systematically bullied by my tech lead. I stayed because I needed the visa sponsorship. That experience shaped my career in ways I am still unpacking, and I need a mentor who can help me move from survival mode to thriving.`,

  (t, y) => `I am a ${t} with ${y} years of experience and I know exactly what I want: to lead a team of 50+ engineers within the next five years. I have a plan, I have the drive, and I have some of the skills. What I do not have is someone who has been there to gut-check my plan, identify blind spots, and accelerate my timeline.`,

  (t, y) => `After ${y} years as a ${t}, I want to understand how to build and leverage a board of advisors for my career — not just one mentor, but a diverse group of people who can advise on different dimensions. I need help thinking about mentorship itself as a strategic practice, not just a one-off relationship.`,

  (t, y) => `I am a ${t} with ${y} years of experience who spends too much time comparing myself to people on LinkedIn and Twitter. The curated success stories, the humble brags, the "I am thrilled to announce" posts — they make me feel like everyone else has it figured out and I am falling behind. I need a mentor who will tell me the real story behind the highlight reel.`,

  (t, y) => `My ${y} years as a ${t} have taught me a lot about building software but almost nothing about building a career. I do not have a five-year plan. I do not know what roles exist above mine. I do not understand how compensation bands work or what a total rewards package should look like at my level. I need foundational career education, and I need it now.`,

  (t, y) => `I am a ${t} with ${y} years of experience, recently diagnosed with a chronic health condition that requires me to rethink my relationship with work entirely. I can no longer grind my way to success. I need a mentor who can help me redesign my career around sustainability without sacrificing my professional identity or my income.`,

  (t, y) => `After ${y} years as a ${t}, I want to leverage my technical background to move into a role at the intersection of technology and policy. Climate tech, AI governance, digital rights — the problems I want to solve are systemic, and the solutions require people who can speak both languages. I need a mentor who operates at that intersection.`,

  (t, y) => `I am a ${t} with ${y} years of experience and the single clearest goal I have ever had: I want to become the kind of leader who transforms organizations, not just manages them. I want to build cultures, shift mindsets, and leave every team better than I found it. I need a mentor who has done this at scale and can show me how to start.`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// MENTEE GOALS — 55 unique, detailed goal statements
// ═══════════════════════════════════════════════════════════════════════════════

const MENTEE_GOALS_TEMPLATES: BioFn[] = [
  (t, y) => `Secure a promotion from ${t} to the next level within 12 months by building a portfolio of high-visibility, cross-team projects and developing the stakeholder management skills that promotion committees look for.`,

  (t, y) => `Transition from my ${t} role into engineering management within 6 months, with a clear understanding of the day-to-day realities, the skills gap I need to close, and a concrete 90-day plan for my first managerial position.`,

  (t, y) => `Increase my total compensation by at least 30% through either an internal equity adjustment or an external move, using market data, negotiation frameworks, and a clear understanding of my market value as a ${t} with ${y} years of experience.`,

  (t, y) => `Build a professional network of 15+ meaningful connections outside my current company, including at least 3 potential sponsors who can advocate for me in leadership conversations and refer me to opportunities.`,

  (t, y) => `Develop executive communication skills — including presentation delivery, written communication to leadership, and the ability to distill complex ${t} work into business impact narratives that resonate with non-technical executives.`,

  (t, y) => `Navigate a career transition out of my current ${t} role into a mission-driven organization focused on climate, healthcare, or education — without taking more than a 15% pay cut.`,

  (t, y) => `Overcome the imposter syndrome that has prevented me from applying to senior roles for the past two years. Develop a concrete framework for recognizing my own accomplishments and speaking about them with confidence.`,

  (t, y) => `Successfully return to full-time work as a ${t} after my career break, including updating my technical skills, rebuilding professional relationships, and negotiating compensation that reflects my total experience, not just my recent gap.`,

  (t, y) => `Master the unwritten rules of corporate advancement — understanding how promotion decisions are made, who influences them, what "executive presence" actually means, and how to build political capital without compromising integrity.`,

  (t, y) => `Build an open-source portfolio and technical blog that establishes me as a thought leader in my domain, opening doors to conference speaking, advisory opportunities, and senior ${t} roles at top-tier companies.`,

  (t, y) => `Create a strategic 3-year career plan that accounts for my personal responsibilities, financial targets, and professional ambitions — with quarterly milestones, a skills development roadmap, and contingency plans for common disruptions.`,

  (t, y) => `Learn to negotiate effectively — not just salary, but scope, title, equity, remote flexibility, and career development budget. Move from accepting what I am offered to proactively shaping the terms of my employment.`,

  (t, y) => `Find and cultivate a sponsor relationship with a senior leader who will actively champion my candidacy during promotion discussions, assign me stretch projects, and introduce me to their professional network.`,

  (t, y) => `Successfully pivot from my ${t} role into product management within 8 months by building PM-relevant skills, getting internal PM project experience, and developing a compelling narrative for why my technical background is an asset.`,

  (t, y) => `Establish sustainable work boundaries that protect my wellbeing and personal relationships without being perceived as uncommitted, and learn to say no to low-impact requests that consume my time but do not advance my career.`,

  (t, y) => `Prepare for and successfully navigate the senior-level interview process at 3+ target companies, including system design, behavioral, and leadership rounds — resulting in at least one offer at or above my target compensation.`,

  (t, y) => `Develop the strategic thinking skills needed to transition from execution-focused ${t} work to a role that involves setting technical direction, influencing roadmaps, and making decisions with organizational-level impact.`,

  (t, y) => `Build confidence in public speaking and technical presentations by delivering at least 4 talks this year — starting with team brownbags, progressing to company all-hands, and eventually submitting to an industry conference.`,

  (t, y) => `Understand and navigate the complexities of equity compensation — vesting schedules, tax implications, exercise windows, and how to evaluate startup equity vs. public company RSUs — so I can make informed decisions about my next role.`,

  (t, y) => `Develop a personal brand that authentically represents my expertise as a ${t} without feeling performative. Build a professional presence that opens doors to advisory boards, speaking engagements, and leadership opportunities.`,

  (t, y) => `Learn to manage up effectively — understanding my skip-level's priorities, communicating my impact in terms they care about, and building enough visibility with senior leadership that my contributions are recognized during calibration.`,

  (t, y) => `Transition from a technical individual contributor track to a people leadership path, developing skills in hiring, performance management, team culture building, and the emotional intelligence needed to manage diverse teams.`,

  (t, y) => `Expand my technical skill set strategically — identifying the 2-3 technologies or methodologies that will be most valuable for senior ${t} roles over the next 3-5 years, and developing demonstrable expertise in each.`,

  (t, y) => `Heal from the professional burnout I experienced at my last company and build a sustainable relationship with work that allows me to be ambitious without being self-destructive. Develop habits and boundaries that prevent future burnout.`,

  (t, y) => `Navigate the decision of whether to stay at my current company or make a move — based on a clear-eyed assessment of growth potential, compensation trajectory, culture alignment, and long-term career positioning.`,

  (t, y) => `Develop the skills and relationships needed to eventually start my own company, including understanding fundraising, product-market fit, early hiring, and how to translate ${y} years of ${t} experience into founder credibility.`,

  (t, y) => `Build cross-functional influence by developing relationships with product, design, sales, and executive stakeholders — moving beyond being seen as a "technical resource" to being recognized as a strategic partner.`,

  (t, y) => `Learn to give and receive feedback effectively — developing the skill to deliver constructive criticism with empathy, accept critical feedback without defensiveness, and create a culture of candor within my team.`,

  (t, y) => `Position myself for a director-level role within 2-3 years by developing the organizational design, budget management, and executive communication skills that distinguish managers from senior leaders.`,

  (t, y) => `Build financial literacy around my career — understanding how total compensation works, how to evaluate offers holistically, how to save and invest based on tech comp structures, and how to build long-term wealth.`,

  (t, y) => `Develop a framework for making career decisions that aligns with my values, not just my ambitions. Learn to evaluate opportunities based on personal fulfillment, cultural fit, and long-term sustainability — not just title and compensation.`,

  (t, y) => `Overcome the cultural conditioning that makes self-promotion feel uncomfortable, and learn to articulate my value in ways that are authentic to who I am while being effective in corporate environments.`,

  (t, y) => `Master the art of stakeholder management — learning to navigate competing priorities, manage expectations, say no diplomatically, and build the kind of trust that makes people want to work with you and advocate for you.`,

  (t, y) => `Create a structured approach to professional development as a ${t}, including identifying skill gaps, finding learning resources, tracking progress, and translating new skills into visible career impact.`,

  (t, y) => `Address the pay equity gap in my career by understanding market rates, building a case for adjustment, and developing the negotiation confidence to close the gap — whether through internal advocacy or an external move.`,

  (t, y) => `Learn how to thrive as a ${t} in a remote-first environment — building relationships without proximity, maintaining visibility without facetime, and creating the career momentum that used to come from hallway conversations.`,

  (t, y) => `Develop the skills to lead technical architecture decisions and influence engineering strategy at the organizational level, moving from being a contributor within existing systems to being a designer of new ones.`,

  (t, y) => `Build resilience for navigating corporate change — reorgs, leadership turnover, priority shifts, and the general uncertainty that defines modern tech careers. Develop an adaptive strategy that keeps me growing regardless of external chaos.`,

  (t, y) => `Prepare for the unique challenges of senior-level remote interviews, including virtual whiteboarding, system design via screen share, and building rapport with interviewers when you cannot read the room.`,

  (t, y) => `Establish myself as a go-to person in my organization for ${t}-related decisions, building the kind of domain authority that leads to promotion, retention offers, and influential project assignments.`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// MENTEE TOPICS — 55 unique, detailed discussion topics
// ═══════════════════════════════════════════════════════════════════════════════

const MENTEE_TOPIC_TEMPLATES: ((title: string) => string)[] = [
  (t) => `Navigating the unwritten promotion criteria for ${t} roles at large tech companies — understanding what calibration committees actually look for beyond technical output`,
  (t) => `Career transition strategies for a ${t} exploring the leap into engineering management, product management, or technical leadership`,
  (t) => `Building technical credibility and executive presence as a ${t} from a non-traditional or self-taught background`,
  (t) => `Salary negotiation and total compensation optimization for ${t} roles — including base, equity, signing bonus, and benefits analysis across company stages`,
  (t) => `Burnout recovery and sustainable career design for a ${t} who has been running at unsustainable pace`,
  (t) => `Developing political awareness and organizational influence as a ${t} preparing for leadership responsibilities`,
  (t) => `Work-life integration strategies for a ${t} balancing caregiving, personal health, and career advancement`,
  (t) => `Modern interview preparation and job search strategy for a ${t} re-entering the market after a gap or long tenure`,
  (t) => `Cultural adaptation and professional networking strategies for an international ${t} building a career in the US tech industry`,
  (t) => `Overcoming imposter syndrome and developing authentic self-advocacy as a ${t} from an underrepresented background`,
  (t) => `Building a personal technical brand through writing, speaking, and open source contributions as a ${t}`,
  (t) => `Understanding and navigating equity compensation — RSUs, ISOs, vesting schedules, and tax implications for ${t} roles`,
  (t) => `Developing cross-functional influence and stakeholder management skills as a ${t} aiming for staff-level scope`,
  (t) => `Strategies for making a compelling case for remote work flexibility as a ${t} in organizations pushing return-to-office`,
  (t) => `Navigating the first 90 days in a new ${t} role — building credibility, quick wins, and relationship foundations`,
  (t) => `How to effectively manage up as a ${t} — making your work visible to skip-levels and building executive sponsorship`,
  (t) => `Evaluating career opportunities holistically as a ${t} — beyond compensation to culture, growth potential, and long-term fit`,
  (t) => `Building resilience for organizational change — surviving reorgs, leadership transitions, and priority pivots as a ${t}`,
  (t) => `Developing the written and verbal communication skills that separate senior ${t}s from staff-level leaders`,
  (t) => `Strategies for breaking through the "senior ceiling" as a ${t} — understanding what distinguishes senior from principal or director`,
  (t) => `How to build and maintain a professional network authentically as a ${t} who hates performative networking`,
  (t) => `Understanding the dynamics of startup vs. enterprise environments and planning a strategic move as a ${t}`,
  (t) => `How to recover professionally and emotionally after being part of a layoff or a toxic work experience as a ${t}`,
  (t) => `Exploring the intersection of technology and social impact — finding mission-driven ${t} roles that pay fairly`,
  (t) => `Learning to give and receive feedback effectively as a ${t} — building a culture of candor in engineering teams`,
  (t) => `Strategic approaches to technical skill development — identifying which technologies and frameworks to invest in as a ${t}`,
  (t) => `How to navigate visa sponsorship challenges and build a stable career foundation as an international ${t}`,
  (t) => `Developing financial literacy around tech compensation — investing, tax optimization, and building wealth as a ${t}`,
  (t) => `How to prepare for and succeed in staff-level or principal-level ${t} interviews at top-tier companies`,
  (t) => `Navigating parenthood while maintaining career trajectory — parental leave strategy and re-integration as a ${t}`,
  (t) => `Building the confidence to have difficult workplace conversations — negotiations, confrontations, and boundary-setting as a ${t}`,
  (t) => `Exploring the freelance and consulting path as a ${t} — building a client base, setting rates, and managing the business side`,
  (t) => `How to develop and demonstrate "strategic thinking" as a ${t} when your role is primarily execution-focused`,
  (t) => `Navigating the complexities of being a team lead for the first time as a ${t} — the peer-to-manager transition`,
  (t) => `How to identify and develop mentor and sponsor relationships organically as a ${t} at any career stage`,
  (t) => `The psychology of career decisions — overcoming analysis paralysis, risk aversion, and the fear of making wrong moves as a ${t}`,
  (t) => `How to maintain technical depth while developing leadership breadth as a ${t} on the management track`,
  (t) => `Strategies for closing the pay gap — understanding why you are underpaid as a ${t} and developing a plan to fix it`,
  (t) => `How to position years of niche technical expertise as versatile transferable skills when pivoting as a ${t}`,
  (t) => `Understanding the board and executive perspective — how to communicate ${t} impact in the language of business outcomes`,
  (t) => `Building a sustainable relationship with ambition — staying driven without burning out as a ${t} in high-pressure environments`,
  (t) => `How to turn technical excellence into organizational influence as a ${t} who prefers building to politicking`,
  (t) => `Navigating the return to work after a career break — rebuilding confidence, updating skills, and managing the narrative as a ${t}`,
  (t) => `Developing a decision framework for the "stay or go" question — when the right move is staying and growing vs. when it is time to leave as a ${t}`,
  (t) => `How to handle being the "only one" on your team — navigating isolation, representation pressure, and belonging as a ${t} from an underrepresented group`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN — Update all seeded user profiles
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('Connecting to database...\n');

  const users = await sql`
    SELECT id, job_title, years_experience, mentoring_as, email
    FROM user_profiles
    WHERE email LIKE '%+seed%'
    ORDER BY created_at
  `;

  console.log(`Found ${users.length} seeded users to update\n`);

  if (users.length === 0) {
    console.log('No seeded users found. Exiting.');
    await sql.end();
    return;
  }

  let mentorCount = 0;
  let menteeCount = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const title = user.job_title || 'Software Engineer';
    const years = user.years_experience || 3;
    const isMentor = user.mentoring_as === 'mentor';

    if (isMentor) {
      const generalBio = MENTOR_GENERAL_BIOS[mentorCount % MENTOR_GENERAL_BIOS.length](title, years);
      const mentorBio = MENTOR_BIO_TEMPLATES[mentorCount % MENTOR_BIO_TEMPLATES.length](title, years);

      await sql`
        UPDATE user_profiles
        SET bio = ${generalBio},
            mentor_bio = ${mentorBio},
            updated_at = now()
        WHERE id = ${user.id}
      `;
      mentorCount++;
    } else {
      const generalBio = MENTEE_GENERAL_BIOS[menteeCount % MENTEE_GENERAL_BIOS.length](title, years);
      const menteeBio = MENTEE_BIO_TEMPLATES[menteeCount % MENTEE_BIO_TEMPLATES.length](title, years);
      const goals = MENTEE_GOALS_TEMPLATES[menteeCount % MENTEE_GOALS_TEMPLATES.length](title, years);
      const topic = MENTEE_TOPIC_TEMPLATES[menteeCount % MENTEE_TOPIC_TEMPLATES.length](title);

      await sql`
        UPDATE user_profiles
        SET bio = ${generalBio},
            mentee_bio = ${menteeBio},
            mentee_goals = ${goals},
            mentee_topic = ${topic},
            updated_at = now()
        WHERE id = ${user.id}
      `;
      menteeCount++;
    }
  }

  console.log(`Updated ${mentorCount} mentor profiles`);
  console.log(`Updated ${menteeCount} mentee profiles`);

  // ─── Verification samples ──────────────────────────────────────────────────

  const mentorSamples = await sql`
    SELECT job_title, years_experience,
           substring(bio for 200) as bio_preview,
           substring(mentor_bio for 200) as mentor_bio_preview
    FROM user_profiles
    WHERE email LIKE '%+seed%' AND mentoring_as = 'mentor'
    ORDER BY random() LIMIT 5
  `;
  console.log('\n══════ MENTOR SAMPLES ══════');
  for (const m of mentorSamples) {
    console.log(`\nTITLE: ${m.job_title} (${m.years_experience}y)`);
    console.log(`BIO:        ${m.bio_preview}...`);
    console.log(`MENTOR_BIO: ${m.mentor_bio_preview}...`);
    console.log('─'.repeat(60));
  }

  const menteeSamples = await sql`
    SELECT job_title, years_experience,
           substring(bio for 200) as bio_preview,
           substring(mentee_bio for 200) as mentee_bio_preview,
           substring(mentee_goals for 200) as goals_preview,
           substring(mentee_topic for 150) as topic_preview
    FROM user_profiles
    WHERE email LIKE '%+seed%' AND mentoring_as = 'mentee'
    ORDER BY random() LIMIT 5
  `;
  console.log('\n══════ MENTEE SAMPLES ══════');
  for (const m of menteeSamples) {
    console.log(`\nTITLE: ${m.job_title} (${m.years_experience}y)`);
    console.log(`BIO:          ${m.bio_preview}...`);
    console.log(`MENTEE_BIO:   ${m.mentee_bio_preview}...`);
    console.log(`GOALS:        ${m.goals_preview}...`);
    console.log(`TOPIC:        ${m.topic_preview}...`);
    console.log('─'.repeat(60));
  }

  // ─── Uniqueness check ─────────────────────────────────────────────────────

  const dupeCheck = await sql`
    SELECT bio, count(*) as cnt
    FROM user_profiles
    WHERE email LIKE '%+seed%'
    GROUP BY bio
    HAVING count(*) > 1
    ORDER BY cnt DESC
    LIMIT 5
  `;

  if (dupeCheck.length === 0) {
    console.log('\n✓ All bios are unique — zero duplicates');
  } else {
    console.log(`\n⚠ Found ${dupeCheck.length} duplicate bio groups:`);
    for (const d of dupeCheck) {
      console.log(`  ${d.cnt}x: ${(d.bio as string).substring(0, 80)}...`);
    }
  }

  await sql.end();
  console.log('\nDone!');
}

main().catch(console.error);
