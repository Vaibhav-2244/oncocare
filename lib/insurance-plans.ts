import { supabase } from "@/lib/supabase-client";

export type InsurancePlan = {
  id: string;
  name: string;
  provider_id: string;
  coverage_amount: number;
  waiting_period_months: number | null;
  estimated_premium: number | null;
  benefits: string[];
  cancer_coverage: boolean;
  hospital_network_size: number | null;
  is_active: boolean;
  provider: {
    id: string;
    name: string;
    description: string | null;
  };
};

export async function getInsurancePlans(): Promise<InsurancePlan[]> {
  const { data, error } = await supabase
    .from("insurance_plans")
    .select(`
      id,
      name,
      provider_id,
      coverage_amount,
      waiting_period_months,
      estimated_premium,
      benefits,
      cancer_coverage,
      hospital_network_size,
      is_active,
      provider:insurance_providers (
        id,
        name,
        description
      )
    `)
    .eq("is_active", true)
    .eq("cancer_coverage", true)
    .order("coverage_amount", { ascending: false });

  if (error) {
    console.error("Failed to fetch insurance plans:", error);
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as InsurancePlan[];
}