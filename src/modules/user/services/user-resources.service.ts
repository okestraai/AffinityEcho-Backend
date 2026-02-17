import { Injectable } from '@nestjs/common';

@Injectable()
export class UserResourcesService {
  getCrisisResources() {
    return {
      success: true,
      data: {
        emergency: {
          title: 'Emergency Services',
          description: 'If you are in immediate danger, call emergency services',
          number: '911',
          available: '24/7',
        },
        categories: [
          {
            id: 'mental-health',
            title: 'Mental Health Support',
            icon: 'Brain',
            resources: [
              {
                name: '988 Suicide & Crisis Lifeline',
                description: '24/7 support for people in distress',
                phone: '988',
                text: 'Text HOME to 741741',
                website: 'https://988lifeline.org',
                available: '24/7',
                languages: ['English', 'Spanish'],
              },
              {
                name: 'Crisis Text Line',
                description: 'Free, 24/7 text-based mental health support',
                text: 'Text HELLO to 741741',
                website: 'https://www.crisistextline.org',
                available: '24/7',
                languages: ['English'],
              },
              {
                name: 'NAMI Helpline',
                description: 'National Alliance on Mental Illness helpline',
                phone: '1-800-950-NAMI (6264)',
                website: 'https://www.nami.org/help',
                available: 'Mon-Fri, 10am-10pm ET',
                languages: ['English', 'Spanish'],
              },
              {
                name: 'SAMHSA National Helpline',
                description: 'Free referrals and information service',
                phone: '1-800-662-4357',
                website: 'https://www.samhsa.gov/find-help/national-helpline',
                available: '24/7, 365 days a year',
                languages: ['English', 'Spanish'],
              },
            ],
          },
          {
            id: 'workplace',
            title: 'Workplace Support',
            icon: 'Building2',
            resources: [
              {
                name: 'EEOC (Equal Employment Opportunity Commission)',
                description: 'Federal agency handling workplace discrimination',
                phone: '1-800-669-4000',
                website: 'https://www.eeoc.gov',
                available: 'Mon-Fri, 8am-8pm ET',
                languages: ['English', 'Spanish'],
              },
              {
                name: 'Department of Labor',
                description: 'Workers rights and workplace safety',
                phone: '1-866-487-2365',
                website: 'https://www.dol.gov',
                available: 'Mon-Fri, 8am-5pm ET',
                languages: ['English', 'Spanish'],
              },
              {
                name: 'Workplace Fairness',
                description: 'Information about workplace rights',
                website: 'https://www.workplacefairness.org',
                available: 'Online 24/7',
                languages: ['English'],
              },
            ],
          },
          {
            id: 'identity',
            title: 'Identity-Specific Support',
            icon: 'Heart',
            resources: [
              {
                name: 'The Trevor Project',
                description: 'Crisis intervention for LGBTQ+ youth',
                phone: '1-866-488-7386',
                text: 'Text START to 678-678',
                website: 'https://www.thetrevorproject.org',
                available: '24/7',
                languages: ['English', 'Spanish'],
              },
              {
                name: 'Trans Lifeline',
                description: 'Support for transgender people',
                phone: '877-565-8860',
                website: 'https://translifeline.org',
                available: '24/7',
                languages: ['English', 'Spanish'],
              },
              {
                name: 'StopAAPIHate',
                description: 'Reporting center for anti-Asian hate',
                website: 'https://stopaapihate.org',
                available: 'Online 24/7',
                languages: ['English', 'Chinese', 'Japanese', 'Korean', 'Vietnamese', 'Thai'],
              },
              {
                name: 'National Indigenous Women\'s Resource Center',
                description: 'Support for Native women',
                phone: '1-855-649-7299',
                website: 'https://www.niwrc.org',
                available: 'Mon-Fri, 9am-5pm CT',
                languages: ['English'],
              },
            ],
          },
          {
            id: 'self-care',
            title: 'Self-Care Resources',
            icon: 'Sparkles',
            resources: [
              {
                name: 'Mindfulness & Meditation',
                description: 'Free guided exercises for stress relief',
                tips: [
                  'Practice deep breathing: 4 counts in, 7 counts hold, 8 counts out',
                  'Try progressive muscle relaxation',
                  'Use grounding techniques: name 5 things you see, 4 you touch, 3 you hear',
                  'Journal your thoughts and feelings',
                ],
              },
              {
                name: 'Workplace Boundaries',
                description: 'Tips for maintaining healthy boundaries',
                tips: [
                  'Set clear work hours and stick to them',
                  'Learn to say no without guilt',
                  'Document incidents and keep records',
                  'Identify trusted colleagues for support',
                  'Take regular breaks during the workday',
                ],
              },
              {
                name: 'Building Resilience',
                description: 'Strategies for long-term wellbeing',
                tips: [
                  'Maintain connections with supportive people',
                  'Engage in regular physical activity',
                  'Practice self-compassion and positive self-talk',
                  'Seek professional help when needed',
                  'Celebrate small victories and progress',
                ],
              },
            ],
          },
        ],
        disclaimer:
          'These resources are provided for informational purposes only. If you are in immediate danger, please call 911 or your local emergency services. Affinity is not a crisis service provider.',
      },
    };
  }

  getCommunityGuidelines() {
    return {
      success: true,
      data: {
        title: 'Community Guidelines',
        lastUpdated: '2024-12-01',
        introduction:
          'Welcome to our community. These guidelines help us maintain a safe, respectful, and inclusive environment for all members. By participating in our platform, you agree to follow these guidelines.',
        sections: [
          {
            id: 'respect',
            title: 'Respect & Inclusivity',
            icon: 'Heart',
            description: 'Treat all community members with dignity and respect',
            guidelines: [
              'Use inclusive language and avoid stereotypes',
              'Respect different perspectives, experiences, and backgrounds',
              'Address others by their preferred names and pronouns',
              'Avoid assumptions about someone\'s identity, role, or experience',
              'Celebrate diversity and learn from different viewpoints',
            ],
          },
          {
            id: 'safety',
            title: 'Safety & Privacy',
            icon: 'Shield',
            description: 'Protect yourself and others in our community',
            guidelines: [
              'Never share personal information of others without consent',
              'Respect the anonymity features of the platform',
              'Report any suspicious or threatening behavior immediately',
              'Do not screenshot or share private conversations',
              'Use strong passwords and protect your account',
            ],
          },
          {
            id: 'communication',
            title: 'Communication Standards',
            icon: 'MessageSquare',
            description: 'Maintain professional and constructive dialogue',
            guidelines: [
              'Keep discussions constructive and solution-oriented',
              'Provide specific, actionable feedback',
              'Avoid inflammatory or provocative language',
              'Listen actively and seek to understand before responding',
              'Use content warnings when discussing sensitive topics',
            ],
          },
          {
            id: 'prohibited',
            title: 'Prohibited Behavior',
            icon: 'XCircle',
            description: 'Actions that will result in immediate moderation',
            guidelines: [
              'Harassment, bullying, or intimidation of any kind',
              'Hate speech or discrimination based on protected characteristics',
              'Sharing explicit, violent, or disturbing content',
              'Spam, scams, or misleading information',
              'Impersonating other users or organizations',
              'Doxxing or sharing private information without consent',
              'Retaliation against users who report violations',
            ],
          },
          {
            id: 'mentorship',
            title: 'Mentorship Guidelines',
            icon: 'Users',
            description: 'Best practices for mentor-mentee relationships',
            guidelines: [
              'Set clear expectations and boundaries at the start',
              'Maintain professional relationships at all times',
              'Respect time commitments and communicate changes promptly',
              'Keep mentorship discussions confidential',
              'Provide honest, constructive guidance',
              'Report any inappropriate behavior in mentorship relationships',
            ],
          },
          {
            id: 'content',
            title: 'Content Guidelines',
            icon: 'FileText',
            description: 'Standards for posts, comments, and shared content',
            guidelines: [
              'Share accurate and truthful information',
              'Give proper attribution when sharing others\' work or ideas',
              'Keep content relevant to the community and its purpose',
              'Use appropriate tags and categories for your posts',
              'Avoid excessive self-promotion or advertising',
            ],
          },
          {
            id: 'reporting',
            title: 'Reporting & Enforcement',
            icon: 'Flag',
            description: 'How we handle violations and maintain community standards',
            guidelines: [
              'Report violations using the built-in reporting tools',
              'Reports are reviewed within 24-48 hours',
              'Violations may result in warnings, temporary bans, or permanent removal',
              'All reports are confidential - reporter identity is protected',
              'Appeals can be submitted within 30 days of any action taken',
              'Repeated violations will result in escalating consequences',
            ],
          },
        ],
        reportingInfo: {
          title: 'How to Report',
          description:
            'If you witness or experience any violation of these guidelines, please report it immediately.',
          methods: [
            {
              method: 'In-App Reporting',
              description: 'Use the flag icon on any post, comment, or message',
            },
            {
              method: 'Safety Team',
              description: 'Contact our safety team directly through the app',
            },
            {
              method: 'Emergency',
              description:
                'For immediate safety concerns, contact local emergency services (911)',
            },
          ],
        },
        acknowledgment:
          'By using our platform, you acknowledge that you have read, understood, and agree to abide by these community guidelines. We reserve the right to update these guidelines as needed to maintain a safe and inclusive community.',
      },
    };
  }
}
