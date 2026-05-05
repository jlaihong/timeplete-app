/** Shared props for platform-specific collaborator role controls. */
export interface CollaboratorRoleBadgeProps {
  label: string;
  disabled?: boolean;
  onOpenFromRect: (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => void;
}
