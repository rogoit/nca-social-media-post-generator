export const sampleTranscripts = {
  short: "This is a short transcript about digital transformation.",

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

export const sampleAIResponses = {
  youtube: `
TRANSCRIPT:
Welcome to our podcast about digital innovation.

TITLE:
Digital Innovation Podcast - Cloud Technology Insights

DESCRIPTION:
Join us as we explore how modern enterprises are leveraging cloud solutions
to revolutionize their operations. Learn from industry leaders with 20+ years
of experience about best practices, challenges, and real-world success stories.

TIMESTAMPS:
0:00 Introduction
3:30 Cloud Migration Strategies
7:00 Best Practices
`.trim(),

  linkedin: `
LINKEDIN POST:
🎯 The Future of Digital Transformation

In today's rapidly evolving business landscape, organizations must adapt
or risk falling behind. Our latest conversation explores how forward-thinking
enterprises are leveraging cloud technology and data analytics to drive
meaningful transformation.

What's been your biggest learning from leading digital initiatives?

#DigitalTransformation #BusinessStrategy
`.trim(),

  instagram: `
INSTAGRAM POST:
🚀 Digital transformation isn't just tech - it's reimagining how we deliver value.

#nevercodealone #vibecoding #coding #ai #ki #DigitalTransformation #Innovation
`.trim(),
};

export const invalidInputs = {
  emptyTranscript: "",
  tooShort: "too short",
  missingPlatform: { transcript: "valid transcript" },
  invalidPlatform: { platform: "invalid", transcript: "valid transcript" },
};
