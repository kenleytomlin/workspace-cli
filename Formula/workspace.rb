# Homebrew formula for workspace-cli
# Install: brew tap kenleytomlin/workspace-cli https://github.com/kenleytomlin/workspace-cli && brew install workspace

class Workspace < Formula
  desc "Buildpacks for agent-friendly git repos"
  homepage "https://github.com/kenleytomlin/workspace-cli"
  version "0.3.2"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/kenleytomlin/workspace-cli/releases/download/v#{version}/workspace-darwin-arm64.tar.gz"
      sha256 "dacc4c44ec7c41a21df3d71a6391b397c28fd2d418ae9e60b6c474ad7384808a"
    end
    on_intel do
      url "https://github.com/kenleytomlin/workspace-cli/releases/download/v#{version}/workspace-darwin-x64.tar.gz"
      sha256 "afcae3edb33c0d150f0b369e9075e6c48e1b24f176f0583372aa7fd405262954"
    end
  end

  on_linux do
    url "https://github.com/kenleytomlin/workspace-cli/releases/download/v#{version}/workspace-linux-x64.tar.gz"
    sha256 "3421e592a62df98a4a9281e1f73b2ac85164dd7efd0090e64b54c4bb8b30e36d"
  end

  def install
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "workspace-darwin-arm64" => "workspace"
      else
        bin.install "workspace-darwin-x64" => "workspace"
      end
    else
      bin.install "workspace-linux-x64" => "workspace"
    end
  end

  test do
    system "#{bin}/workspace", "--version"
  end
end
