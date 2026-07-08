// Dates are ISO strings over the wire.
export interface EmployeeUserSummary {
  id: string;
  name: string;
  email: string;
}

export interface Employee {
  id: string;
  userId: string;
  nutritionistId: string;
  user: EmployeeUserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface InviteEmployeeRequest {
  name: string;
  email: string;
}

export interface UpdateEmployeeRequest {
  name: string;
}
