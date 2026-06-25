export const FLASK_PORT = 5001

export const TAG_GROUPS = {
  FittingType: ['DL', 'LIN', 'PS', 'PANEL'],
  Driver: ['Local', 'Remote-CC', 'Remote-CV', 'No-Driver'],
  Wiring: ['5Pin-DALI', '3Pin-TE', '4Pin-TW', 'IP-Rated'],
  Special: ['TwinSpot', 'Exterior', 'JunctionBox'],
}

export const FLAG_COLUMNS = ['IsDesign', 'IsContractItem', 'IsTBC', 'IsPropertiesTBC']

export const DIM_QTY_COMPONENTS = ['TAPE', 'PROFILE', 'DIFF', 'MOUNT', 'FLEX']

export const AUTO_CONTRACT_ITEMS = ['CAP', 'CLIP', 'DRIVER', 'CCL', 'CCR', 'GLAND', 'SLEEVE']

export const VALID_FLAG_VALUES = ['Y', null]

export const GLOBAL_TEMPLATE_IDS = [
  'DL+Local', 'DL+Remote-CC', 'DL+Exterior',
  'DL+Local+3Pin', 'DL+Local+4Pin', 'DL+Local+TwinSpot',
  'LIN+Tape+Profile', 'LIN+Flex+Mount', 'LIN+Flex', 'PANEL'
]

export const AUTO_UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60

export const SLOT_KEYS = {
  DESIGN_ELEMENT: 'DESIGN_ELEMENT',
  SITE_SOCKET: 'SITE_SOCKET',
  SITE_SR: 'SITE_SR',
  MOUNT_COLLAR: 'MOUNT_COLLAR',
  LOCAL_DRIVER: 'LOCAL_DRIVER',
  DRIVER_PLUG: 'DRIVER_PLUG',
  DC_SOCKET: 'DC_SOCKET',
  DC_PLUG: 'DC_PLUG',
  DC_SR: 'DC_SR',
  REMOTE_SOCKET: 'REMOTE_SOCKET',
  REMOTE_PLUG: 'REMOTE_PLUG',
  LIN_SOCKET: 'LIN_SOCKET',
  LIN_PLUG: 'LIN_PLUG',
  LOCKING_LEVER: 'LOCKING_LEVER',
  CLIPS: 'CLIPS',
  TAPE: 'TAPE',
  PROFILE: 'PROFILE',
  DIFFUSER: 'DIFFUSER',
  END_CAPS: 'END_CAPS',
  MOUNT_CHANNEL: 'MOUNT_CHANNEL',
}
