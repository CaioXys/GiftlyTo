// Coordenadas do local da festa — troque pelas coordenadas reais quando souber
const LOCAL_FESTA = {
  lat: -23.5009016394939,
  lng: -46.18040001475659,
  nome: "Av. Antônio de Almeida, 1115 - Jardim Marica, Mogi das Cruzes - SP, 08775-420",
};

let chaveApiCache = null;

// Mostra a imagem estática (capa desfocada) sem gastar a cota do mapa interativo
async function mostrarCapaMapa() {
  try {
    const resposta = await fetch('/api/config');
    const config = await resposta.json();
    chaveApiCache = config.mapApiKey;

    if (!chaveApiCache) {
      console.error('Chave do Google Maps não configurada no servidor.');
      return;
    }

    const img = document.getElementById('mapaCapa');
    img.src = "../assets/images/mapa-capa.png"
    
  } catch (erro) {
    console.error('Não foi possível carregar a capa do mapa:', erro);
  }
}

// Só carrega o mapa interativo de verdade quando a pessoa clica
async function carregarMapaInterativo() {
  if (!chaveApiCache) return;

  document.getElementById('mapaCapa').hidden = true;
  document.getElementById('btnVerMapa').hidden = true;
  document.getElementById('mapaFesta').hidden = false;

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${chaveApiCache}&callback=initMapaFesta`;
  script.async = true;
  document.head.appendChild(script);
}

function initMapaFesta() {
  const elementoMapa = document.getElementById("mapaFesta");

  const mapa = new google.maps.Map(elementoMapa, {
    center: LOCAL_FESTA,
    zoom: 16,
  });

  new google.maps.Marker({
    position: LOCAL_FESTA,
    map: mapa,
    title: LOCAL_FESTA.nome,
  });

  // Força o mapa a recalcular seu tamanho corretamente,
  // já que ele foi criado dentro de um container que estava "hidden" até o clique.
  google.maps.event.trigger(mapa, 'resize');
  mapa.setCenter(LOCAL_FESTA); // o resize pode descentralizar o mapa, então recentraliza
}

window.initMapaFesta = initMapaFesta;

document.addEventListener('DOMContentLoaded', () => {
  mostrarCapaMapa();
  document.getElementById('btnVerMapa').addEventListener('click', carregarMapaInterativo);
});