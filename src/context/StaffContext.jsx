import { createContext, useContext } from "react";
export const StaffContext = createContext(null);
export function useStaff() { return useContext(StaffContext); }
