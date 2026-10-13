# Runs against the unchanged official Material Maker source project.
# The native graph editor and export share one RenderingDevice and one window.
extends SceneTree
var work_dir: String
var mm_window
var last_request: String = ""
var running: bool = false
var state: Dictionary = {}
var heartbeat: float = 0.0
const INPUT_LABELS = {"source":"原图 · 当前图层", "motion":"运动 Mask", "emission":"发光 Mask", "phase":"流光相位 Mask", "foil":"反光 Mask", "inset":"框内外 Mask", "rigid":"刚性保护 Mask"}
func label_inputs(graph):
 if not graph:
  return
 for node in graph.get_children():
  if node is GraphNode:
   var generator = node.get("generator")
   if generator and str(generator.name).begins_with("CardscapeInput_"):
    var channel = str(generator.name).trim_prefix("CardscapeInput_")
    var title = INPUT_LABELS.get(channel, channel)
    if node.title != title:
     node.title = title
func _initialize():
 var args = OS.get_cmdline_user_args()
 if args.size() != 1:
  quit(2)
  return
 work_dir = args[0]
 call_deferred("boot")
func write_state(value: Dictionary):
 state = value
 state.pid = OS.get_process_id()
 state.at = Time.get_unix_time_from_system()
 var file = FileAccess.open(work_dir.path_join("native-state.tmp"), FileAccess.WRITE)
 if file:
  file.store_string(JSON.stringify(value))
  file.close()
  DirAccess.rename_absolute(work_dir.path_join("native-state.tmp"), work_dir.path_join("native-state.json"))
func boot():
 await process_frame
 var locale = load("res://material_maker/locale/locale.gd").new()
 locale.read_translations()
 mm_window = load("res://material_maker/main_window.tscn").instantiate()
 root.add_child(mm_window)
 await process_frame
 mm_window.layout.set_panel_visible("Library", true)
 mm_window.layout.set_panel_visible("Preview2D", true)
 mm_window.layout.set_panel_visible("Preview3D", true)
 await mm_window.do_load_material(work_dir.path_join("material.ptex"))
 await process_frame
 var graph = mm_window.get_current_graph_edit()
 if graph:
  label_inputs(graph)
  var bounds = Rect2()
  var count = 0
  for node in graph.get_children():
   if node is GraphNode:
    var rect = Rect2(node.position_offset, node.size)
    bounds = rect if count == 0 else bounds.merge(rect)
    count += 1
  if count > 0 and bounds.size.x > 0.0 and bounds.size.y > 0.0:
   graph.zoom = clampf(minf((graph.size.x - 80.0) / bounds.size.x, (graph.size.y - 80.0) / bounds.size.y), graph.zoom_min, 1.0)
   await process_frame
   graph.scroll_offset = bounds.get_center() * graph.zoom - graph.size * 0.5
  for node in graph.get_children():
   if node is GraphNode:
    var generator = node.get("generator")
    if generator and generator.has_method("get_export_profiles") and generator.get_export_profiles().has("Cardscape/Live"):
     var source = generator.get_source(1)
     if source:
      for candidate in graph.get_children():
       if candidate is GraphNode and candidate.get("generator") == source.generator:
        graph.set_current_preview(0, candidate, source.output_index)
        break
     var preview = mm_window.get_panel("Preview2D")
     if preview and preview.has_meta("flex_node"):
      preview.get_meta("flex_node").set_current(preview)
     break
 root.title = "Material Maker · Cardscape"
 write_state({"phase":"ready","version":ProjectSettings.get_setting("application/config/actual_release"),"pid":OS.get_process_id()})
 var timer = Timer.new()
 timer.wait_time = 0.5
 root.add_child(timer)
 timer.timeout.connect(check_request)
 timer.start()
func _process(delta):
 heartbeat += delta
 if heartbeat > 2.0 and not state.is_empty():
  heartbeat = 0.0
  if mm_window:
   label_inputs(mm_window.get_current_graph_edit())
  write_state(state)
 return false
func check_request():
 if running or not FileAccess.file_exists(work_dir.path_join("request.json")):
  return
 var value = JSON.parse_string(FileAccess.get_file_as_string(work_dir.path_join("request.json")))
 if not value is Dictionary or not value.has("id") or str(value.id) == last_request:
  return
 last_request = str(value.id)
 if value.get("command", "") == "focus":
  root.grab_focus()
  return
 running = true
 write_state({"phase":"exporting","request":last_request,"pid":OS.get_process_id()})
 var graph = await root.get_node("mm_loader").load_gen(work_dir.path_join("material.ptex"))
 if graph == null:
  write_state({"phase":"error","request":last_request,"error":"Material Maker 工程读取失败"})
  running = false
  return
 root.add_child(graph)
 var count = 0
 for node in graph.get_children():
  if node.has_method("export_material") and node.get_export_profiles().has("Cardscape/Live"):
   count += 1
   await node.export_material(work_dir.path_join("output/material"), "Cardscape/Live", 512, true)
 label_inputs(mm_window.get_current_graph_edit())
 await process_frame
 root.get_texture().get_image().save_png(work_dir.path_join("native-preview.png"))
 graph.queue_free()
 if count == 1 and FileAccess.file_exists(work_dir.path_join("output/material.glsl")):
  write_state({"phase":"exported","request":last_request,"pid":OS.get_process_id()})
 else:
  write_state({"phase":"error","request":last_request,"error":"需要唯一的 Cardscape Output 输出节点"})
 running = false
