import z from 'zod';

export const ecosystemCategories = [
  'Client-Side Integrations',
  'Services/Endpoints',
  'Infrastructure & Tooling',
  'Learning & Community Resources',
  'Facilitators',
] as const;

export type EcosystemCategory = (typeof ecosystemCategories)[number];

export const ecosystemItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  logoUrl: z
    .string()
    // x402.org stopped serving /logos/* — load them from the x402 repo instead.
    .transform(path =>
      path.startsWith('http')
        ? path
        : `https://raw.githubusercontent.com/coinbase/x402/main/typescript/site/public${path}`
    ),
  websiteUrl: z.url(),
  category: z.enum(ecosystemCategories),
});

export type EcosystemItem = z.infer<typeof ecosystemItemSchema>;
