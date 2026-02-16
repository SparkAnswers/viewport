FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    xrdp \
    xfce4 \
    xfce4-terminal \
    supervisor \
    dbus-x11 \
    netcat-openbsd \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create test user
RUN useradd -m -s /bin/bash testuser \
    && echo "testuser:testpass" | chpasswd \
    && adduser testuser ssl-cert

# Configure xrdp to use xfce4
RUN echo "xfce4-session" > /home/testuser/.xsession \
    && chown testuser:testuser /home/testuser/.xsession

# Generate xrdp RSA keys
RUN xrdp-keygen xrdp auto

# Ensure dbus system bus directory exists
RUN mkdir -p /run/dbus

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 3389

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
