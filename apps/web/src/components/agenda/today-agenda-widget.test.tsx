import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Appointment } from "@nutri-plus/shared-types";

const useAppointments = vi.fn();
vi.mock("@/lib/queries/appointments", () => ({
  useAppointments: (...a: unknown[]) => useAppointments(...a),
  useCreateAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/queries/patients", () => ({ usePatients: () => ({ data: [] }) }));
vi.mock("@/lib/queries/appointment-categories", () => ({
  useAppointmentCategories: () => ({ data: [], isLoading: false }),
}));
const pathname = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

import { TodayAgendaWidget } from "./today-agenda-widget";

function appt(over: Partial<Appointment> = {}): Appointment {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    id: "ap1",
    nutritionistId: "n1",
    patientId: "p1",
    title: "Consulta",
    description: null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
    patient: { id: "p1", user: { id: "u1", name: "Ana Souza", email: "ana@x.com" } },
    categoryId: null,
    category: null,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  pathname.mockReturnValue("/patients");
  useAppointments.mockReset().mockReturnValue({ data: [appt()], isLoading: false, isError: false });
});

describe("TodayAgendaWidget", () => {
  it("renders today's appointments with title and patient", () => {
    render(<TodayAgendaWidget />);
    expect(screen.getByText("Agenda de hoje")).toBeInTheDocument();
    expect(screen.getByText(/Consulta/)).toBeInTheDocument();
    expect(screen.getByText(/Ana Souza/)).toBeInTheDocument();
  });

  it("opens the appointment dialog when a row is clicked", async () => {
    render(<TodayAgendaWidget />);
    await userEvent.click(screen.getByText(/Consulta/));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("minimizes to a pill with the count and expands back", async () => {
    render(<TodayAgendaWidget />);
    await userEvent.click(screen.getByRole("button", { name: /minimizar/i }));
    expect(screen.getByText("Hoje · 1")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Hoje · 1"));
    expect(screen.getByText("Agenda de hoje")).toBeInTheDocument();
  });

  it("shows an empty state with no appointments", () => {
    useAppointments.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<TodayAgendaWidget />);
    expect(screen.getByText("Sem agendamentos hoje.")).toBeInTheDocument();
  });

  it("renders nothing on the /agenda route", () => {
    pathname.mockReturnValue("/agenda");
    const { container } = render(<TodayAgendaWidget />);
    expect(container).toBeEmptyDOMElement();
  });
});
