// Coordenadas do local da festa — troque pelas coordenadas reais quando souber
const PARTY_LOCATION = {
  lat: -23.5009016394939,
  lng: -46.18040001475659,
  label:
    'Av. Antônio de Almeida, 1115 - Jardim Marica, Mogi das Cruzes - SP, 08775-420',
}

let apiKeyCache = null

// Mostra a imagem estática (capa desfocada) sem gastar a cota do mapa interativo
async function showMapCover() {
  try {
    const response = await fetch('/api/config')
    const config = await response.json()
    apiKeyCache = config.mapApiKey

    if (!apiKeyCache) {
      console.error('Chave do Google Maps não configurada no servidor.')
      return
    }

    const img = document.getElementById('mapaCapa')
    img.src = '../assets/images/mapa-capa.png'
  } catch (error) {
    console.error('Não foi possível carregar a capa do mapa:', error)
  }
}

// Só carrega o mapa interativo de verdade quando a pessoa clica
async function loadInteractiveMap() {
  if (!apiKeyCache) return

  document.getElementById('mapaCapa').hidden = true
  document.getElementById('btnVerMapa').hidden = true
  document.getElementById('mapaFesta').hidden = false

  const script = document.createElement('script')
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKeyCache}&callback=initPartyMap`
  script.async = true
  document.head.appendChild(script)
}

function initPartyMap() {
  const mapElement = document.getElementById('mapaFesta')

  const map = new google.maps.Map(mapElement, {
    center: PARTY_LOCATION,
    zoom: 16,
  })

  new google.maps.Marker({
    position: PARTY_LOCATION,
    map,
    title: PARTY_LOCATION.label,
  })

  // Força o mapa a recalcular seu tamanho corretamente,
  // já que ele foi criado dentro de um container que estava "hidden" até o clique.
  google.maps.event.trigger(map, 'resize')
  map.setCenter(PARTY_LOCATION) // o resize pode descentralizar o mapa, então recentraliza
}

window.initPartyMap = initPartyMap

document.addEventListener('DOMContentLoaded', () => {
  showMapCover()
  document
    .getElementById('btnVerMapa')
    .addEventListener('click', loadInteractiveMap)
})
