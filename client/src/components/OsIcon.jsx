// Inline SVG OS logos — one per distro
// ostype values from pct config: debian, ubuntu, centos, fedora, opensuse, archlinux, alpine, ...
// VM: from /etc/os-release ID= field

function DebianIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path fill="#D70A53" d="
        M50,3 C24.6,3 4,23.6 4,49 C4,65.4 12.9,79.8 26.1,88.1
        C25.3,84.2 25,79.3 25.8,75.4 L29.2,60.5
        C28.3,58.7 27.7,56.1 27.7,53.8
        C27.7,46.2 32.1,40.5 37.6,40.5
        C42.3,40.5 44.5,44.1 44.5,48.3
        C44.5,53 41.6,60.1 40.1,66.8
        C38.8,72.5 42.1,77.1 47.8,77.1
        C57.8,77.1 64.7,65.3 64.7,51.7
        C64.7,40.3 57,32 44.7,32
        C30.9,32 22.4,42.5 22.4,53.5
        C22.4,57.5 23.8,61.4 26.3,63.3
        C27.2,64.1 27.5,64.6 27.2,65.7
        C26.9,67.3 26.2,70.2 25.9,71.6
        C25.5,73.4 24.4,73.8 22.6,72.7
        C13,67.5 7.5,52.3 7.5,41
        C7.5,18.6 24.2,3 46.5,3
        C66.5,3 79.5,17 79.5,35.9
        C79.5,57 65.7,70.5 48.8,70.5
        C42.8,70.5 37.2,67.5 35.4,63.8
        L31.8,75.7
        C30.4,80.7 27.5,86.4 25.3,89.8
        C33,92 41.3,92.8 50,92.8
        C75.4,92.8 96,72.2 96,46.8
        C96,21.4 75.4,1 50,1 Z
      "/>
    </svg>
  )
}

function UbuntuIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#E95420"/>
      {/* Central ring */}
      <circle cx="50" cy="50" r="16" fill="none" stroke="white" strokeWidth="6.5"/>
      {/* Three white dots: top, lower-left, lower-right */}
      <circle cx="50" cy="16" r="8.5" fill="white"/>
      <circle cx="20" cy="67" r="8.5" fill="white"/>
      <circle cx="80" cy="67" r="8.5" fill="white"/>
      {/* Gaps in ring at each dot */}
      <line x1="50" y1="34" x2="50" y2="24.5" stroke="#E95420" strokeWidth="6.5"/>
      <line x1="36.2" y1="58" x2="28.4" y2="62.5" stroke="#E95420" strokeWidth="6.5"/>
      <line x1="63.8" y1="58" x2="71.6" y2="62.5" stroke="#E95420" strokeWidth="6.5"/>
    </svg>
  )
}

function ProxmoxIcon({ className }) {
  // Proxmox VE logo: orange sweep + black inner X
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {/* White background so the black parts show */}
      <circle cx="50" cy="50" r="48" fill="white"/>
      {/* Orange outer curves */}
      <path fill="#E57000" d="
        M50,4
        C28,4 9,20 5,42
        Q18,32 35,42 Q50,52 65,42 Q82,32 95,42
        C91,20 72,4 50,4 Z
      "/>
      <path fill="#E57000" d="
        M50,96
        C72,96 91,80 95,58
        Q82,68 65,58 Q50,48 35,58 Q18,68 5,58
        C9,80 28,96 50,96 Z
      "/>
      {/* Black inner X shape */}
      <path fill="#1a1a1a" d="
        M28,18 L18,28 L41,50 L18,72 L28,82 L50,59 L72,82 L82,72 L59,50 L82,28 L72,18 L50,41 Z
      "/>
    </svg>
  )
}

function ContainerIcon({ className }) {
  // Isometric box / container icon
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {/* Top face */}
      <polygon points="50,8 90,30 50,52 10,30" fill="#555"/>
      {/* Left face */}
      <polygon points="10,30 50,52 50,92 10,70" fill="#333"/>
      {/* Right face */}
      <polygon points="90,30 50,52 50,92 90,70" fill="#e05c00"/>
    </svg>
  )
}

function GenericIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="84" height="84" rx="12" fill="#3a3a4a"/>
      <rect x="20" y="25" width="60" height="8" rx="4" fill="#666"/>
      <rect x="20" y="42" width="45" height="8" rx="4" fill="#555"/>
      <rect x="20" y="59" width="52" height="8" rx="4" fill="#555"/>
    </svg>
  )
}

// Normalize ostype to a canonical key
function normalizeOs(ostype) {
  if (!ostype || ostype === 'unknown') return 'container'
  const t = ostype.toLowerCase()
  if (t === 'debian' || t.startsWith('debian')) return 'debian'
  if (t === 'ubuntu' || t.startsWith('ubuntu')) return 'ubuntu'
  // All other Linux distros (centos, fedora, alpine, arch, etc.) → container box
  return 'container'
}

export default function OsIcon({ ostype, className = 'w-6 h-6' }) {
  const key = normalizeOs(ostype)
  if (key === 'debian') return <DebianIcon className={className} />
  if (key === 'ubuntu') return <UbuntuIcon className={className} />
  return <ContainerIcon className={className} />
}

// For the Proxmox node itself (NodeCard)
export function ProxmoxNodeIcon({ className = 'w-6 h-6' }) {
  return <ProxmoxIcon className={className} />
}
