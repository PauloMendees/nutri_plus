export interface AppointmentCategory {
  id: string;
  nutritionistId: string;
  name: string;
  color: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentCategorySummary {
  id: string;
  name: string;
  color: string | null;
}

export interface CreateAppointmentCategoryRequest {
  name: string;
  color?: string | null;
  isDefault?: boolean;
}

export interface UpdateAppointmentCategoryRequest {
  name?: string;
  color?: string | null;
  isDefault?: boolean;
}
