# DXER Multichain node - private blockchain for anchoring
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV MULTICHAIN_VERSION=2.0.3

RUN apt-get update \
 && apt-get install -y --no-install-recommends wget ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && wget -q "https://www.multichain.com/download/multichain-${MULTICHAIN_VERSION}.tar.gz" -O /tmp/multichain.tar.gz \
 && tar -xzf /tmp/multichain.tar.gz -C /tmp \
 && mv /tmp/multichain-${MULTICHAIN_VERSION}/multichaind /tmp/multichain-${MULTICHAIN_VERSION}/multichain-cli /tmp/multichain-${MULTICHAIN_VERSION}/multichain-util /usr/local/bin/ \
 && rm -rf /tmp/multichain.tar.gz /tmp/multichain-${MULTICHAIN_VERSION}

WORKDIR /root/.multichain

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4798

ENTRYPOINT ["/entrypoint.sh"]
