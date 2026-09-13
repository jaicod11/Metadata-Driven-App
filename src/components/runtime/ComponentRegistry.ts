// src/components/runtime/ComponentRegistry.ts
//
// Central lookup table: layout/component type string → React component.
// Import this file to get/register components. Never import DynamicForm
// directly from RuntimeRenderer — always go through this registry.
//
// To add a custom component:
//   import { registerComponent } from "@/components/runtime/ComponentRegistry";
//   registerComponent("calendar", MyCalendarComponent);

import { ComponentType } from "react";
import { FallbackComponent } from "./FallbackComponent";

// Lazy-import the built-in components to keep this file cycle-free.
// The actual modules are loaded when getComponent() is first called.
let _DynamicForm: ComponentType<any> | null = null;
let _DynamicTable: ComponentType<any> | null = null;
let _DynamicDashboard: ComponentType<any> | null = null;
let _DetailView: ComponentType<any> | null = null;
let _AuditLogView: ComponentType<any> | null = null;
let _RelatedList: ComponentType<any> | null = null;
let _GridLayout: ComponentType<any> | null = null;
let _TabsLayout: ComponentType<any> | null = null;
let _StackLayout: ComponentType<any> | null = null;

// Runtime-extensible registry for custom types
const customRegistry: Record<string, ComponentType<any>> = {};

/** Register a custom component type at runtime */
export function registerComponent(type: string, component: ComponentType<any>) {
  customRegistry[type.toLowerCase()] = component;
}

/** Check if a type has a registered component */
export function hasComponent(type: string): boolean {
  const key = type.toLowerCase();
  return (
    key in customRegistry ||
    [
      "form", "table", "dashboard", "detail", "auditlog",
      "relatedlist", "grid", "tabs", "stack",
    ].includes(key)
  );
}

/**
 * Resolve a component by its type string.
 * Built-ins are loaded lazily on first call to avoid circular imports.
 * Unknown types return FallbackComponent — never throws.
 */
export function getComponent(type: string): ComponentType<any> {
  const key = type.toLowerCase();

  // Custom-registered components take precedence
  if (customRegistry[key]) return customRegistry[key];

  switch (key) {
    case "form":
      if (!_DynamicForm) {
        // Dynamic require to avoid circular import at module evaluation time
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _DynamicForm = require("./forms/DynamicForm").DynamicForm;
      }
      return _DynamicForm!;

    case "table":
      if (!_DynamicTable) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _DynamicTable = require("./tables/DynamicTable").DynamicTable;
      }
      return _DynamicTable!;

    case "dashboard":
      if (!_DynamicDashboard) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _DynamicDashboard = require("./dashboards/DynamicDashboard").DynamicDashboard;
      }
      return _DynamicDashboard!;

    case "detail":
      if (!_DetailView) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _DetailView = require("./detail/DetailView").DetailView;
      }
      return _DetailView!;

    case "auditlog":
      if (!_AuditLogView) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _AuditLogView = require("./audit/AuditLogView").AuditLogView;
      }
      return _AuditLogView!;

    case "relatedlist":
      if (!_RelatedList) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _RelatedList = require("./relations/RelatedList").RelatedList;
      }
      return _RelatedList!;

    case "grid":
      if (!_GridLayout) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _GridLayout = require("./layouts/GridLayout").GridLayout;
      }
      return _GridLayout!;

    case "tabs":
      if (!_TabsLayout) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _TabsLayout = require("./layouts/TabsLayout").TabsLayout;
      }
      return _TabsLayout!;

    case "stack":
      if (!_StackLayout) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _StackLayout = require("./layouts/StackLayout").StackLayout;
      }
      return _StackLayout!;

    default:
      return FallbackComponent;
  }
}
