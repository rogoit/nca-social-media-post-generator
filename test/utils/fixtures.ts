/**
 * Sample transcripts for testing
 */
export const sampleTranscripts = {
  short: 'This is a short transcript about digital transformation.',

  medium: `
    Welcome to our podcast about digital innovation. Today we're discussing
    how businesses are leveraging cloud technology to transform their operations.
    We'll explore real-world examples and best practices from industry leaders.
    Our guest today has over 20 years of experience in enterprise technology.
  `.trim(),

  long: `
    Welcome everyone to today's episode. We're diving deep into the world of
    digital transformation and how it's reshaping modern business practices.

    Let's start with the fundamentals. Digital transformation isn't just about
    technology - it's about reimagining how businesses operate, deliver value,
    and engage with customers in an increasingly digital world.

    Our guest today brings a wealth of experience from leading transformation
    initiatives across multiple Fortune 500 companies. We'll explore the
    challenges, successes, and lessons learned from these journeys.

    Key topics we'll cover include cloud migration strategies, data analytics
    implementation, customer experience optimization, and building a culture
    of innovation within traditional organizations.
  `.trim(),

  edgeCase: 'Special chars: @#$% & émojis 🚀 and "quotes" with newlines\n\ntest',
};

/**
 * Sample AI responses for different platforms
 */
export const sampleAIResponses = {
  youtube: `
📌 Transforming Business Through Cloud Technology

Join us as we explore how modern enterprises are leveraging cloud solutions
to revolutionize their operations. Learn from industry leaders with 20+ years
of experience about best practices, challenges, and real-world success stories.

🔑 Key Topics:
• Cloud migration strategies
• Digital innovation frameworks
• Customer experience optimization

#DigitalTransformation #CloudComputing #Innovation #BusinessStrategy
  `.trim(),

  facebook: `
We're excited to share insights on digital transformation! 🚀

In our latest discussion, we explore how businesses are using cloud technology
to transform operations and deliver better customer experiences.

What challenges has your organization faced in digital transformation?
Share your experiences below! 👇

#DigitalTransformation #BusinessInnovation #TechLeadership
  `.trim(),

  linkedin: `
🎯 The Future of Digital Transformation

In today's rapidly evolving business landscape, organizations must adapt
or risk falling behind. Our latest conversation explores how forward-thinking
enterprises are leveraging cloud technology and data analytics to drive
meaningful transformation.

Key insights from this discussion:

→ Digital transformation is fundamentally about culture, not just technology
→ Successful initiatives require executive buy-in and cross-functional collaboration
→ Customer experience must remain at the center of transformation efforts

What's been your biggest learning from leading digital initiatives?

#DigitalTransformation #BusinessStrategy #Innovation #Leadership #Technology
  `.trim(),

  instagram: `
🚀 Digital transformation isn't just tech - it's reimagining how we deliver value.

Today's discussion covers:
✨ Cloud migration strategies
✨ Data-driven decision making
✨ Building innovation culture

What aspect of digital transformation interests you most?

#DigitalTransformation #Innovation #BusinessGrowth #TechTrends #Leadership
  `.trim(),
};

/**
 * Expected parsed responses by platform
 */
export const expectedParsedContent = {
  youtube: sampleAIResponses.youtube,
  facebook: sampleAIResponses.facebook,
  linkedin: sampleAIResponses.linkedin,
  instagram: sampleAIResponses.instagram,
};

/**
 * Invalid input scenarios
 */
export const invalidInputs = {
  emptyTranscript: '',
  tooShort: 'too short',
  missingPlatform: { transcript: 'valid transcript' },
  invalidPlatform: { platform: 'invalid', transcript: 'valid transcript' },
  tooLong: 'a'.repeat(50001),
};
