export interface ProjectItem {
    created_at: string;
    id: number;
    name: string;
}

export interface ProjectListResponse extends Array<ProjectItem> {}

export interface Project {
    created_at: string;
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
