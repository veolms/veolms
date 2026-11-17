export const onboardingKeys = {
  all: ["onboarding"] as const,
  state: () => [...onboardingKeys.all, "state"] as const,
  address: (slug: string) => [...onboardingKeys.all, "address", slug] as const,
  firstMoves: () => [...onboardingKeys.all, "first-moves"] as const,
};
