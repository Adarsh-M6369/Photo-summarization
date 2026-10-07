import json
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.services.file_storage import (
    move_to_recycle_bin,
    restore_photo,
    empty_recycle_bin,
    read_recycle_bin_manifest,
)
from app.core.database import get_db

logger = logging.getLogger("photo_culling.mcp_tools")


class MoveToRecycleBinInput(BaseModel):
    event_id: str = Field(..., description="The unique identifier for the event")
    photo_id: str = Field(..., description="The unique identifier of the photo to discard")
    defect_reason: str = Field("human_disapproved", description="The reason for discard (e.g. closed_eyes, motion_blur, poor_expression)")


class RestorePhotoInput(BaseModel):
    event_id: str = Field(..., description="The unique identifier for the event")
    photo_id: str = Field(..., description="The unique identifier of the photo to restore")


class EmptyRecycleBinInput(BaseModel):
    event_id: str = Field(..., description="The unique identifier for the event to purge recycle bin")


# MCP Tool Definitions Schema
MCP_TOOL_DEFINITIONS = [
    {
        "name": "move_to_recycle_bin",
        "description": "Safely moves a discarded event photo into the staged .recycle_bin directory and registers audit manifest entry.",
        "input_schema": MoveToRecycleBinInput.model_json_schema(),
    },
    {
        "name": "restore_photo_from_recycle_bin",
        "description": "Restores a previously discarded photo from .recycle_bin back to active keeper pool.",
        "input_schema": RestorePhotoInput.model_json_schema(),
    },
    {
        "name": "empty_event_recycle_bin",
        "description": "Permanently deletes all staged discarded files in an event's .recycle_bin.",
        "input_schema": EmptyRecycleBinInput.model_json_schema(),
    },
]


async def execute_mcp_tool(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes an MCP tool call by name with validated parameters.
    """
    try:
        if tool_name == "move_to_recycle_bin":
            params = MoveToRecycleBinInput(**arguments)
            res = await move_to_recycle_bin(params.event_id, params.photo_id, params.defect_reason)
            return {"success": True, "action": "move_to_recycle_bin", "data": res}

        elif tool_name == "restore_photo_from_recycle_bin":
            params = RestorePhotoInput(**arguments)
            res = await restore_photo(params.event_id, params.photo_id)
            return {"success": True, "action": "restore_photo", "data": res}

        elif tool_name == "empty_event_recycle_bin":
            params = EmptyRecycleBinInput(**arguments)
            res = await empty_recycle_bin(params.event_id)
            return {"success": True, "action": "empty_recycle_bin", "data": res}

        else:
            return {"success": False, "error": f"Unknown MCP tool: {tool_name}"}
    except Exception as exc:
        logger.error(f"Error executing MCP tool {tool_name}: {exc}")
        return {"success": False, "error": str(exc)}
