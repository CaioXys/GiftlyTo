const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const festaExistente = await prisma.party.findFirst();

    let party = festaExistente;
    if (!party) {
        party = await prisma.party.create({
            data: {
                honoreeName: 'Gilson',
                age: 70,
                partyDate: new Date('2026-10-24'),
                message:
                    'Junte-se a nós para celebrar 70 anos de histórias, risadas e muito amor!', 
            },
        });
        console.log('✅ Festa criada:', party.honoreeName);
    } else {
        console.log('ℹ️ Já existe uma festa cadastrada, mantendo como está.');
    }

    const presentesExistentes = await prisma.gift.count();

    if (presentesExistentes === 0) {
        await prisma.gift.createMany({
            data: [
        {
          partyId: party.id,
          name: 'Café da manhã especial',
          description: 'Contribuição para um café da manhã caprichado',
          category: 'pix',
          suggestedValue: 80,
        },
        {
          partyId: party.id,
          name: 'Viagem para a praia',
          description: 'Contribuição para aquela viagem que ele sempre quis fazer',
          category: 'pix',
          suggestedValue: 200,
        },
        {
          partyId: party.id,
          name: 'Kit de jardinagem',
          description: 'Ferramentas novas pro jardim que ele tanto cuida',
          category: 'pix',
          suggestedValue: 120,
        },
        ],
        });
        console.log('✅ Presentes de exemplo criados.');
    } else {
        console.log('ℹ️ Já existem presentes cadastrados, mantendo como estão.');
    }
}

main().catch((err) => {
    console.error('❌ Erro ao popular o banco:', err);
    process.exitCode = 1;
}).finally(async () => {
    await prisma.$disconnect();
});