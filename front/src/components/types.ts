export interface ProjectItem {
    created_at: string;
    daily_kwh_consumption: number;
    id: number;
    name: string;
}

export interface ProjectListResponse extends Array<ProjectItem> {}

export interface Project {
    created_at: string;
    daily_kwh_consumption: number;
    id: number;
    name: string;
    solar_panels: SolarPanel[];
    wind_turbines: WindTurbine[];
}

export interface SolarPanel {
    id: number;
    latitude: number;
    longitude: number;
    panel_type: string;
    project_id: number;
    surface_area: number;
}

export interface WindTurbine {
    id: number;
    latitude: number;
    longitude: number;
    project_id: number;
    turbine_type: string;
}

export interface Revenu {
    solar_panels: SolarPanelRev[];
    total_annual_kwh: number;
    total_cost: number;
    total_daily_kwh: number;
    wind_turbines: WindTurbineRev[];
}

export interface SolarPanelRev {
    annual_kwh: number;
    cost: number;
    daily_kwh: number;
    id: number;
    irradiance: number;
    latitude: number;
    longitude: number;
    panel_type: string;
    surface_area: number;
}

export interface WindTurbineRev {
    annual_kwh: number;
    cost: number;
    daily_kwh: number;
    id: number;
    latitude: number;
    longitude: number;
    turbine_type: string;
    v_mean: number;
}

export interface YearlyCumulative {
    year: number;
    cumulative_eur: number;
}

export interface Viability {
    annual_grid_cost_eur: number;
    annual_savings_eur: number;
    daily_consumption_kwh: number;
    daily_deficit_kwh: number;
    daily_production_kwh: number;
    daily_resell_kwh: number;
    daily_savings_eur: number;
    daily_self_consumption_kwh: number;
    payback_years: number | null;
    total_cost: number;
    yearly_cumulative: YearlyCumulative[];
}
