import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders Travel Planner header", () => {
  render(<App />);
  expect(screen.getByText(/Travel Planner/i)).toBeInTheDocument();
});
