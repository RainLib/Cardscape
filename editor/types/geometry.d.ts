/** Data contract for the generated sample geometry and its effect presets. */
interface Window {
  CARD_MODEL: {
    parts: LegacyGeometryPart[];
    stats: {
      card_width_mm: number;
      card_height_mm: number;
      body_thickness_mm: number;
      front_rim_peak_from_center_mm: number;
      corner_peak_from_center_mm: number;
      back_emblem_peak_from_center_mm: number;
      nodes: number;
      triangles: number;
      all_variants_triangles: number;
      textured_preview_triangles: number;
      structure_triangles: number;
      illustration_triangles: number;
      illustration_peak_mm: number;
      background_card_width_scale: number;
      background_overscan_vs_aperture_width: number;
      groups: {
        body: { nodes: number; triangles: number };
        frame: { nodes: number; triangles: number };
        corners: { nodes: number; triangles: number };
        rear_corners: { nodes: number; triangles: number };
        pendants: { nodes: number; triangles: number };
        emblem: { nodes: number; triangles: number };
        cloth: { nodes: number; triangles: number };
        art_front: { nodes: number; triangles: number };
        art_back: { nodes: number; triangles: number };
        ill_background: { nodes: number; triangles: number };
        ill_relief: { nodes: number; triangles: number };
        pop_foreground: { nodes: number; triangles: number };
        pop_background: { nodes: number; triangles: number };
        pop_bottom: { nodes: number; triangles: number };
      };
      notes: Array<string>;
      runtime_static_meshes: number;
      runtime_static_surfaces: number;
      runtime_static_triangles: number;
      runtime_note: string;
      continuous_surfaces: number;
      continuous_triangles: number;
      parallax_meshes: number;
      parallax_surfaces: number;
      parallax_triangles: number;
      breakout_foreground_triangles: number;
      breakout_foreground_vertices: number;
      breakout_bounds_card_width_units: Array<Array<number>>;
      effect_vertex_channels: {
        _CARD_EFFECTS: Array<string>;
        _POP_BASE: string;
      };
      parallax_note: string;
    };
  };
  CARD_SNAP_GEOMETRY: {
    parts: LegacyGeometryPart[];
    stats: {
      revision: string;
      frame_triangles: number;
      frame_width_mm: number;
      frame_peak_mm: number;
      inspect_triangles: number;
      inspect_surfaces: number;
      foreground_triangles: number;
      foreground_vertices: number;
      flat_triangles: number;
      flat_surfaces: number;
      browser_main_parts_without_wordmark_or_energy: number;
      static_pose_only: boolean;
      complete_cape: boolean;
      full_bleed_source: string;
      baked_frame_in_new_master: boolean;
      lower_ornament_uv_discard: boolean;
      rigid_bracer_hand_grip: boolean;
      independent_cloth_xy_scaling: boolean;
      authored_region_attribute: string;
      export_foreground_triangles: number;
      export_foreground_vertices: number;
      static_frame_clearance: number;
      aperture_half_size: Array<number>;
      aperture_corner: number;
      browser_fragment_aperture_guard: boolean;
      static_export_aperture_clipped: boolean;
    };
  };
  CARD_EFFECT_PRESETS: {
    revision: string;
    defaultTier: number;
    levels: Array<{
      id: string;
      name: string;
      label: string;
      effect: string;
      color: Array<number>;
      breakout: boolean;
      volume: number;
      motion: boolean;
      flow: boolean;
      shine: boolean;
      frame: boolean;
    }>;
    finishes: Array<{ id: string; name: string }>;
    weapon: {
      defaultStyle: string;
      alternativeStyle: string;
      palette: Array<Array<number>>;
      idleArc: string;
      flow: string;
      simulation: string;
    };
    camera: {
      defaultYaw: number;
      defaultPitch: number;
      hoverYaw: number;
      hoverPitch: number;
      dragYaw: number;
      dragPitch: number;
      responseSeconds: number;
    };
    timing: {
      loopSeconds: number;
      focusTargetHz: number;
      inspectionTargetHz: number;
      burstSeconds: number;
    };
    performance: {
      newFullSizeEffectTextures: number;
      wordmarkTextureSize: Array<number>;
    };
    reference: {
      upgradeGuide: string;
      selectedCard: string;
      variant: string;
      officialFootage: string;
      footageSectionSeconds: Array<number>;
      publicToolCaseStudy: string;
      matchStatus: string;
    };
  };
}
